import { createUntypedAdminClient } from '@/lib/supabase/admin';

import type {
  CapabilityToolResult,
  ManageCapabilityInput,
  ScheduledCapability,
} from './types';

const TABLE = 'astra_scheduled_capabilities';

interface CapabilityRow {
  id: string;
  workspace_id: string;
  user_id: string;
  astra_key: string;
  kind: ScheduledCapability['kind'];
  title: string;
  fire_at: string;
  timezone: string;
  status: ScheduledCapability['status'];
  revision: number;
  task_id: string | null;
  session_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

function toCapability(row: CapabilityRow): ScheduledCapability {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    astraKey: row.astra_key,
    kind: row.kind,
    title: row.title,
    fireAt: row.fire_at,
    timezone: row.timezone,
    status: row.status,
    revision: row.revision,
    taskId: row.task_id,
    sessionId: row.session_id,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    canceledAt: row.canceled_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CapabilityOwner {
  workspaceId: string;
  userId: string;
  astraKey: string;
}

export async function listCapabilities(owner: CapabilityOwner): Promise<ScheduledCapability[]> {
  const { data, error } = await createUntypedAdminClient()
    .from(TABLE)
    .select('*')
    .eq('user_id', owner.userId)
    .eq('astra_key', owner.astraKey)
    .order('fire_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data as CapabilityRow[]).map(toCapability);
}

async function scheduleCapability(
  owner: CapabilityOwner,
  input: ManageCapabilityInput,
): Promise<CapabilityToolResult> {
  const client = createUntypedAdminClient();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      workspace_id: owner.workspaceId,
      user_id: owner.userId,
      astra_key: owner.astraKey,
      kind: input.kind,
      title: input.title,
      fire_at: new Date(input.fire_at!).toISOString(),
      timezone: input.timezone,
      idempotency_key: input.idempotency_key,
      task_id: input.task_id ?? null,
      session_id: input.session_id ?? null,
      audit_metadata: { source: 'manage_capability', scheduled_at: new Date().toISOString() },
    })
    .select('*')
    .single();

  if (!error) return { ok: true, capability: toCapability(data as CapabilityRow) };
  if (error.code !== '23505') throw new Error(error.message);

  const { data: existing, error: existingError } = await client
    .from(TABLE)
    .select('*')
    .eq('user_id', owner.userId)
    .eq('idempotency_key', input.idempotency_key!)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error('Idempotent capability lookup failed.');
  return { ok: true, capability: toCapability(existing as CapabilityRow), replayed: true };
}

async function mutateCapability(
  owner: CapabilityOwner,
  input: ManageCapabilityInput,
): Promise<CapabilityToolResult> {
  const now = new Date();
  const patch =
    input.action === 'cancel'
      ? { status: 'canceled', canceled_at: now.toISOString() }
      : input.action === 'complete'
        ? { status: 'completed', completed_at: now.toISOString() }
        : {
            status: 'snoozed',
            fire_at: new Date(now.getTime() + input.snooze_minutes! * 60_000).toISOString(),
            due_at: null,
            delivered_at: null,
          };
  const { data, error } = await createUntypedAdminClient()
    .from(TABLE)
    .update({
      ...patch,
      revision: input.expected_revision! + 1,
      audit_metadata: {
        source: 'manage_capability',
        action: input.action,
        acted_at: now.toISOString(),
      },
    })
    .eq('id', input.capability_id!)
    .eq('user_id', owner.userId)
    .eq('astra_key', owner.astraKey)
    .eq('revision', input.expected_revision!)
    .in('status', ['scheduled', 'snoozed', 'due'])
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { ok: true, capability: toCapability(data as CapabilityRow) };

  const { data: current, error: currentError } = await createUntypedAdminClient()
    .from(TABLE)
    .select('revision, status')
    .eq('id', input.capability_id!)
    .eq('user_id', owner.userId)
    .eq('astra_key', owner.astraKey)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!current) return { ok: false, code: 'not_found', message: 'Capability not found.' };
  if (current.revision !== input.expected_revision) {
    return {
      ok: false,
      code: 'revision_conflict',
      message: 'The capability changed. Refresh it before trying again.',
      current_revision: current.revision,
      retryable: true,
    };
  }
  return { ok: false, code: 'not_active', message: `Capability is already ${current.status}.` };
}

export async function manageCapability(
  owner: CapabilityOwner,
  input: ManageCapabilityInput,
): Promise<CapabilityToolResult> {
  if (input.action === 'list') return { ok: true, capabilities: await listCapabilities(owner) };
  if (input.action === 'schedule') return scheduleCapability(owner, input);
  return mutateCapability(owner, input);
}

export async function transitionDueCapabilities(now = new Date()): Promise<ScheduledCapability[]> {
  const client = createUntypedAdminClient();
  const { data: candidates, error } = await client
    .from(TABLE)
    .select('*')
    .in('status', ['scheduled', 'snoozed'])
    .lte('fire_at', now.toISOString())
    .order('fire_at', { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);

  const transitioned: ScheduledCapability[] = [];
  for (const candidate of (candidates ?? []) as CapabilityRow[]) {
    const { data, error: updateError } = await client
      .from(TABLE)
      .update({
        status: 'due',
        due_at: now.toISOString(),
        audit_metadata: { source: 'scheduler_tick', fired_at: now.toISOString() },
      })
      .eq('id', candidate.id)
      .eq('revision', candidate.revision)
      .in('status', ['scheduled', 'snoozed'])
      .select('*')
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (data) transitioned.push(toCapability(data as CapabilityRow));
  }
  return transitioned;
}

export async function claimCapabilityDelivery(
  capability: ScheduledCapability,
  channel: 'in_app' | 'push' | 'live',
): Promise<boolean> {
  const { error } = await createUntypedAdminClient().from('astra_capability_deliveries').insert({
    capability_id: capability.id,
    user_id: capability.userId,
    revision: capability.revision,
    channel,
    state: 'delivered',
    attempt_count: 1,
    delivered_at: new Date().toISOString(),
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(error.message);
}
