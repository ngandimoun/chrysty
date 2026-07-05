import { isSystemAstraKey, WORKER_SLUG } from '@/lib/astra/constants';
import { createUuid } from '@/lib/ids';
import { createAdminClient, createUntypedAdminClient } from '@/lib/supabase/admin';
import type { AstraWorkspaceInsert, AstraWorkspaceRow } from '@/lib/supabase/astra-schema.types';

export type { AstraWorkspaceRow };

function createVisitorToken(): string {
  return `vis_${createUuid().replace(/-/g, '')}`;
}

function isInsertConflict(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

async function findPlatformWorkspaceId(userId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('worker_workspaces')
    .select('id')
    .eq('user_id', userId)
    .eq('worker_slug', WORKER_SLUG)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

function createAstraKey(): string {
  return `ak_${createUuid().replace(/-/g, '')}`;
}

async function findWorkspaceByUserId(userId: string): Promise<AstraWorkspaceRow | null> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_workspaces')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return (data?.[0] as AstraWorkspaceRow | undefined) ?? null;
}

async function findWorkspaceByAstraKey(astraKey: string): Promise<AstraWorkspaceRow | null> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_workspaces')
    .select('*')
    .eq('astra_key', astraKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as AstraWorkspaceRow | null;
}

export async function ensureAstraWorkspace(
  astraKey: string,
  userId?: string,
): Promise<AstraWorkspaceRow> {
  const existing = await findWorkspaceByAstraKey(astraKey);
  if (existing) {
    return existing;
  }

  const platformWorkspaceId = userId ? await findPlatformWorkspaceId(userId) : null;

  const insert: AstraWorkspaceInsert = {
    astra_key: astraKey,
    visitor_token: createVisitorToken(),
    name: 'My Space',
    is_default: true,
    user_id: userId ?? null,
    platform_workspace_id: platformWorkspaceId,
  };

  const { data: created, error: insertError } = await createUntypedAdminClient()
    .from('astra_workspaces')
    .insert(insert)
    .select('*')
    .single();

  if (insertError) {
    if (isInsertConflict(insertError)) {
      const retry = await findWorkspaceByAstraKey(astraKey);
      if (retry) return retry;
    }
    throw new Error(insertError.message);
  }

  return created as AstraWorkspaceRow;
}

export async function getWorkspaceForAstraKey(astraKey: string) {
  return findWorkspaceByAstraKey(astraKey);
}

async function adoptAnonymousWorkspace(
  userId: string,
  astraKey: string,
): Promise<AstraWorkspaceRow | null> {
  if (isSystemAstraKey(astraKey)) {
    return null;
  }

  const platformWorkspaceId = await findPlatformWorkspaceId(userId);
  const { data, error } = await createUntypedAdminClient()
    .from('astra_workspaces')
    .update({
      user_id: userId,
      platform_workspace_id: platformWorkspaceId,
    })
    .eq('astra_key', astraKey)
    .is('user_id', null)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as AstraWorkspaceRow | null) ?? null;
}

export async function getOrCreateWorkspaceForUser(
  userId: string,
  adoptAstraKey?: string,
): Promise<AstraWorkspaceRow> {
  const existing = await findWorkspaceByUserId(userId);
  if (existing) {
    return existing;
  }

  if (adoptAstraKey) {
    const adopted = await adoptAnonymousWorkspace(userId, adoptAstraKey);
    if (adopted) {
      return adopted;
    }
  }

  const astraKey = createAstraKey();
  return ensureAstraWorkspace(astraKey, userId);
}

export async function resolveCanonicalAstraKey(
  userId: string | undefined,
  headerKey: string | null,
): Promise<string> {
  if (userId) {
    const workspace = await getOrCreateWorkspaceForUser(userId, headerKey ?? undefined);
    return workspace.astra_key;
  }

  if (!headerKey) {
    throw new Error('Missing astra key');
  }

  if (isSystemAstraKey(headerKey)) {
    throw new Error('This workspace key is not available');
  }

  return headerKey;
}
