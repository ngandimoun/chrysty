import { Composio, SessionPreset } from '@composio/core';
import { GoogleProvider } from '@composio/google';

import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { resolveConfiguredJobOrigin } from '@/lib/background-jobs/kickoff';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let composioSingleton: Composio<any> | null = null;

export function getComposioApiKey(): string | null {
  return process.env.COMPOSIO_API_KEY?.trim() || null;
}

export function isComposioConfigured(): boolean {
  return Boolean(getComposioApiKey());
}

export function getComposioAppOrigin(requestUrl?: string): string {
  const configured = resolveConfiguredJobOrigin();
  if (configured) return configured;
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // fall through
    }
  }
  return 'http://localhost:3000';
}

export function getComposioClient() {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured on the server.');
  }

  if (!composioSingleton) {
    composioSingleton = new Composio({
      apiKey,
      provider: new GoogleProvider(),
    });
  }

  return composioSingleton;
}

export async function loadStoredSessionId(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('astra_composio_sessions')
    .select('session_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Composio session: ${error.message}`);
  }

  return data?.session_id ?? null;
}

export async function saveStoredSessionId(userId: string, sessionId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const admin = createAdminClient();
  const { error } = await admin.from('astra_composio_sessions').upsert({
    user_id: userId,
    session_id: sessionId,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to save Composio session: ${error.message}`);
  }
}

function rawSessionToolsIncludeMeta(rawTools: unknown): boolean {
  const list = Array.isArray(rawTools) ? rawTools : [];
  return list.some((tool) => {
    if (!tool || typeof tool !== 'object' || !('name' in tool)) return false;
    const name = (tool as { name?: unknown }).name;
    return typeof name === 'string' && name.toUpperCase().startsWith('COMPOSIO_');
  });
}

async function buildDirectToolsCreateConfig(userId: string) {
  const connections = await listActiveConnections(userId);
  const toolkits = connections.map((row) => row.toolkit_slug);
  return {
    manageConnections: false as const,
    sessionPreset: SessionPreset.DIRECT_TOOLS,
    ...(toolkits.length > 0
      ? {
          toolkits,
          connectedAccounts: buildConnectedAccountsMap(connections),
        }
      : {}),
  };
}

export async function getOrCreateUserSession(userId: string) {
  const composio = getComposioClient();
  const existingId = await loadStoredSessionId(userId);
  const createConfig = await buildDirectToolsCreateConfig(userId);

  if (existingId) {
    try {
      const session = await composio.use(existingId);
      try {
        const tools = await session.tools();
        if (rawSessionToolsIncludeMeta(tools)) {
          console.info('[composio/client] migrating meta session to DIRECT_TOOLS', {
            userId,
            sessionId: existingId,
          });
          try {
            await session.delete();
          } catch {
            // Best-effort; create a new session even if remote delete fails.
          }
          const fresh = await composio.create(userId, createConfig);
          await saveStoredSessionId(userId, fresh.sessionId);
          return fresh;
        }
      } catch (error) {
        console.warn(
          '[composio/client] session.tools probe failed; reusing stored session',
          error instanceof Error ? error.message : error,
        );
      }
      return session;
    } catch {
      // Session may have been deleted remotely — create a fresh one below.
    }
  }

  const session = await composio.create(userId, createConfig);
  await saveStoredSessionId(userId, session.sessionId);
  return session;
}

export interface ComposioConnectionRow {
  user_id: string;
  toolkit_slug: string;
  toolkit_name: string | null;
  logo_url: string | null;
  connected_account_id: string;
  session_id: string | null;
  status: 'active' | 'revoked';
}

export async function listActiveConnections(userId: string): Promise<ComposioConnectionRow[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('astra_composio_connections')
    .select('user_id, toolkit_slug, toolkit_name, logo_url, connected_account_id, session_id, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list Composio connections: ${error.message}`);
  }

  return (data ?? []) as ComposioConnectionRow[];
}

export async function upsertConnection(params: {
  userId: string;
  toolkitSlug: string;
  toolkitName?: string | null;
  logoUrl?: string | null;
  connectedAccountId: string;
  sessionId: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const admin = createAdminClient();
  const { error } = await admin.from('astra_composio_connections').upsert({
    user_id: params.userId,
    toolkit_slug: params.toolkitSlug,
    toolkit_name: params.toolkitName ?? null,
    logo_url: params.logoUrl ?? null,
    connected_account_id: params.connectedAccountId,
    session_id: params.sessionId,
    status: 'active',
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to save Composio connection: ${error.message}`);
  }
}

export async function revokeConnection(userId: string, toolkitSlug: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from('astra_composio_connections')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('toolkit_slug', toolkitSlug);

  if (error) {
    throw new Error(`Failed to revoke Composio connection: ${error.message}`);
  }
}

export function buildConnectedAccountsMap(
  connections: ComposioConnectionRow[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const row of connections) {
    map[row.toolkit_slug] = [row.connected_account_id];
  }
  return map;
}
