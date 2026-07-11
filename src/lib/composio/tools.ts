import type { CustomFunctionDeclaration } from '@/lib/gemini/custom-tools';
import {
  buildConnectedAccountsMap,
  getComposioClient,
  getOrCreateUserSession,
  isComposioConfigured,
  listActiveConnections,
  loadStoredSessionId,
} from '@/lib/composio/client';

const composioToolNames = new Set<string>();

export function isComposioToolsEnabled(): boolean {
  const raw = process.env.GEMINI_ENABLE_COMPOSIO_TOOLS?.trim().toLowerCase();
  if (!raw) {
    return isComposioConfigured();
  }
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

export function isComposioFunctionToolName(name: string): boolean {
  return composioToolNames.has(name);
}

function rememberComposioToolNames(names: string[]): void {
  for (const name of names) {
    composioToolNames.add(name);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapGoogleDeclarationToCustom(tool: unknown): CustomFunctionDeclaration | null {
  const record = asRecord(tool);
  if (!record) return null;

  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) return null;

  const description =
    typeof record.description === 'string' && record.description.trim()
      ? record.description.trim()
      : `Composio tool ${name}`;

  const parameters = asRecord(record.parameters) ?? {
    type: 'object',
    properties: {},
  };

  return {
    type: 'function',
    name,
    description,
    parameters: parameters as CustomFunctionDeclaration['parameters'],
  };
}

/**
 * Load Gemini-ready Composio tools for a user, reusing the stored session and
 * pinning active connected accounts when present.
 */
export async function loadComposioFunctionDeclarations(
  userId: string,
): Promise<CustomFunctionDeclaration[]> {
  if (!isComposioToolsEnabled() || !userId) {
    return [];
  }

  const connections = await listActiveConnections(userId);
  if (connections.length === 0) {
    return [];
  }

  const session = await getOrCreateUserSession(userId);
  const connectedAccounts = buildConnectedAccountsMap(connections);

  try {
    await session.update({
      manageConnections: false,
      connectedAccounts,
    });
  } catch {
    // Pinning is best-effort; tools may still resolve via userId-scoped accounts.
  }

  const rawTools = await session.tools();
  const list = Array.isArray(rawTools) ? rawTools : [];
  const declarations = list
    .map(mapGoogleDeclarationToCustom)
    .filter((tool): tool is CustomFunctionDeclaration => tool !== null);

  rememberComposioToolNames(declarations.map((tool) => tool.name));
  return declarations;
}

export async function executeComposioToolCall(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const composio = getComposioClient();
  const result = await composio.provider.executeToolCall(userId, {
    name,
    args,
  });

  if (typeof result === 'string') {
    try {
      return JSON.parse(result) as unknown;
    } catch {
      return result;
    }
  }

  return result;
}

export async function userHasActiveComposioConnections(userId: string): Promise<boolean> {
  if (!isComposioToolsEnabled() || !userId) return false;
  const sessionId = await loadStoredSessionId(userId);
  if (!sessionId) {
    const connections = await listActiveConnections(userId);
    return connections.length > 0;
  }
  const connections = await listActiveConnections(userId);
  return connections.length > 0;
}
