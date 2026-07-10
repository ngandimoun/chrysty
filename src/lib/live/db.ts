import { createUntypedAdminClient } from '@/lib/supabase/admin';

import type {
  LiveDelegationRecord,
  LiveDelegationStage,
  LiveDelegationStatus,
  LiveDelegateRequest,
  LiveDelegationResult,
  LiveSessionMode,
  LiveSessionStateRecord,
  LiveGuideSessionState,
  DraftObjective,
} from '@/lib/live/types';
import { compactDraftObjective } from '@/lib/live/objective';
import { compactWorkspaceUiContext, type WorkspaceUiContext } from '@/lib/live/workspace-context';

function rowToSession(row: Record<string, unknown>): LiveSessionStateRecord {
  return {
    session_id: String(row.session_id),
    workspace_id: row.workspace_id ? String(row.workspace_id) : null,
    astra_key: String(row.astra_key),
    mode: (row.mode === 'live_guide' ? 'live_guide' : 'default') as LiveSessionMode,
    live_guide_state: (row.live_guide_state as LiveGuideSessionState | null) ?? null,
    draft_objective: compactDraftObjective(row.draft_objective),
    ui_context: compactWorkspaceUiContext(row.ui_context),
    resumption_handle: row.resumption_handle ? String(row.resumption_handle) : null,
    pending_turn_id: row.pending_turn_id ? String(row.pending_turn_id) : null,
    updated_at: String(row.updated_at),
  };
}

export async function getLiveSession(sessionId: string): Promise<LiveSessionStateRecord | null> {
  try {
    const { data, error } = await createUntypedAdminClient()
      .from('astra_live_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error || !data) return null;
    return rowToSession(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function upsertLiveSession(input: {
  session_id: string;
  workspace_id: string;
  astra_key: string;
  mode?: LiveSessionMode;
  live_guide_state?: LiveGuideSessionState | null;
  draft_objective?: DraftObjective | null;
  ui_context?: WorkspaceUiContext | null;
  resumption_handle?: string | null;
  pending_turn_id?: string | null;
}): Promise<LiveSessionStateRecord | null> {
  try {
    const { data, error } = await createUntypedAdminClient()
      .from('astra_live_sessions')
      .upsert(
        {
          session_id: input.session_id,
          workspace_id: input.workspace_id,
          astra_key: input.astra_key,
          mode: input.mode ?? 'default',
          live_guide_state: input.live_guide_state ?? null,
          ...(input.draft_objective !== undefined
            ? { draft_objective: input.draft_objective }
            : {}),
          ...(input.ui_context !== undefined ? { ui_context: input.ui_context } : {}),
          resumption_handle: input.resumption_handle ?? null,
          pending_turn_id: input.pending_turn_id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id' },
      )
      .select('*')
      .single();

    if (error || !data) return null;
    return rowToSession(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function patchLiveSession(
  sessionId: string,
  patch: Partial<{
    mode: LiveSessionMode;
    live_guide_state: LiveGuideSessionState | null;
    draft_objective: DraftObjective | null;
    ui_context: WorkspaceUiContext | null;
    resumption_handle: string | null;
    pending_turn_id: string | null;
  }>,
): Promise<void> {
  try {
    await createUntypedAdminClient()
      .from('astra_live_sessions')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  } catch (error) {
    console.error('[live-sessions] patch failed', error);
  }
}

export async function patchLiveSessionForAstraKey(
  sessionId: string,
  astraKey: string,
  patch: Partial<{
    mode: LiveSessionMode;
    live_guide_state: LiveGuideSessionState | null;
    draft_objective: DraftObjective | null;
    ui_context: WorkspaceUiContext | null;
    resumption_handle: string | null;
    pending_turn_id: string | null;
  }>,
): Promise<boolean> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_live_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('astra_key', astraKey)
    .select('session_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

function rowToDelegation(row: Record<string, unknown>): LiveDelegationRecord {
  return {
    turn_id: String(row.turn_id),
    session_id: String(row.session_id),
    workspace_id: String(row.workspace_id),
    astra_key: String(row.astra_key),
    user_id: row.user_id ? String(row.user_id) : undefined,
    status: String(row.status) as LiveDelegationStatus,
    request: row.request as LiveDelegateRequest,
    stage: row.stage ? (String(row.stage) as LiveDelegationStage) : null,
    result: (row.result as LiveDelegationResult | null) ?? null,
    spoken_summary: row.spoken_summary ? String(row.spoken_summary) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    error_code: row.error_code ? String(row.error_code) : null,
    error_stage: row.error_stage ? (String(row.error_stage) as LiveDelegationStage) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function createLiveDelegation(input: {
  turn_id: string;
  session_id: string;
  workspace_id: string;
  astra_key: string;
  user_id?: string;
  request: LiveDelegateRequest;
}): Promise<LiveDelegationRecord | null> {
  try {
    const { data, error } = await createUntypedAdminClient()
      .from('astra_live_delegations')
      .insert({
        turn_id: input.turn_id,
        session_id: input.session_id,
        workspace_id: input.workspace_id,
        astra_key: input.astra_key,
        user_id: input.user_id ?? null,
        status: 'queued',
        stage: 'queued',
        request: input.request,
      })
      .select('*')
      .single();

    if (error || !data) return null;
    return rowToDelegation(data as Record<string, unknown>);
  } catch (error) {
    console.error('[live-delegations] create failed', error);
    return null;
  }
}

export async function getLiveDelegation(turnId: string): Promise<LiveDelegationRecord | null> {
  try {
    const { data, error } = await createUntypedAdminClient()
      .from('astra_live_delegations')
      .select('*')
      .eq('turn_id', turnId)
      .maybeSingle();

    if (error || !data) return null;
    return rowToDelegation(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function updateLiveDelegation(
  turnId: string,
  patch: Partial<
    Pick<
      LiveDelegationRecord,
      | 'status'
      | 'stage'
      | 'result'
      | 'spoken_summary'
      | 'error_message'
      | 'error_code'
      | 'error_stage'
    >
  >,
): Promise<void> {
  try {
    await createUntypedAdminClient()
      .from('astra_live_delegations')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('turn_id', turnId);
  } catch (error) {
    console.error('[live-delegations] update failed', error);
  }
}

export async function updateLiveDelegationRequest(
  turnId: string,
  request: LiveDelegateRequest,
): Promise<void> {
  try {
    await createUntypedAdminClient()
      .from('astra_live_delegations')
      .update({ request, updated_at: new Date().toISOString() })
      .eq('turn_id', turnId);
  } catch (error) {
    console.error('[live-delegations] request update failed', error);
  }
}
