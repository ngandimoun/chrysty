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
 * Load Gemini-ready Composio tools for a user.
 * NO_AUTH toolkits load even with zero OAuth rows; active OAuth accounts are pinned when present.
 * Tools present on the turn = usable (connect/disconnect reflected on the next load).
 */
export async function loadComposioFunctionDeclarations(
  userId: string,
): Promise<CustomFunctionDeclaration[]> {
  if (!isComposioToolsEnabled() || !userId) {
    return [];
  }

  const session = await getOrCreateUserSession(userId);
  const connections = await listActiveConnections(userId);

  if (connections.length > 0) {
    const connectedAccounts = buildConnectedAccountsMap(connections);
    try {
      await session.update({
        manageConnections: false,
        connectedAccounts,
      });
    } catch {
      // Pinning is best-effort; tools may still resolve via userId-scoped accounts.
    }
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
  await loadStoredSessionId(userId);
  const connections = await listActiveConnections(userId);
  return connections.length > 0;
}

/** Prompt block for the structured LLM when Composio may be on this turn. */
export function buildComposioCompositionBlock(options: {
  toolCount: number;
  toolNames?: string[];
}): string {
  const namePreview =
    options.toolNames && options.toolNames.length > 0
      ? options.toolNames.slice(0, 40).join(', ')
      : '';

  const availableLine =
    options.toolCount > 0
      ? `Connected-app / NO_AUTH tools available this turn (${options.toolCount}): ${namePreview}${
          options.toolNames && options.toolNames.length > 40 ? ', …' : ''
        }.`
      : 'No connected-app toolkit tools are loaded this turn (user may still have none connected, or only need Settings).';

  return `## Connected apps (Composio tools)
${availableLine}

Composition (no hardcoded app pipelines — use tools that are actually on this turn):
- You may jumble Gemini native tools, custom tools, and these connected-app tools in any useful order in the same turn.
- Prefer a matching connected-app tool over native Search/URL when the user's intent clearly fits that toolkit (named app/API, crawl/scrape of a specific service, send/post via a connected account).
- Ambiguous open-web asks (e.g. "what's in the news about AI?") → use native Search; do not call connected-app tools just to discover a search toolkit.
- If the user needs an app/action and no matching function tool is available → briefly suggest Settings → Connection. Do not invent OAuth links or claim you completed the action.
- Connected-app gather → minutes-long research: call tools as needed, then delegateBackgroundTask with a rich objective that includes every relevant detail (and any later send/post intent).
- Native/custom results may feed connected-app tools and vice versa in the same function-call loop.

Never name Composio or internal tool plumbing to the user.`;
}
