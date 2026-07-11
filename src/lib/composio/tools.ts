import type { CustomFunctionDeclaration } from '@/lib/gemini/custom-tools';
import {
  buildConnectedAccountsMap,
  getComposioClient,
  getOrCreateUserSession,
  isComposioConfigured,
  listActiveConnections,
  loadStoredSessionId,
  upsertConnection,
  type ComposioConnectionRow,
} from '@/lib/composio/client';

const composioToolNames = new Set<string>();

/** Gemini Interactions rejects oversized custom-tool lists; keep Composio under this cap. */
const MAX_COMPOSIO_DECLARATIONS = 16;

const GEMINI_SCHEMA_KEYS = new Set([
  'type',
  'description',
  'properties',
  'required',
  'items',
  'enum',
  'nullable',
  'format',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
]);

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

function normalizeSchemaType(typeValue: unknown): { type?: string; nullable?: boolean } {
  if (typeof typeValue === 'string' && typeValue.trim()) {
    return { type: typeValue.trim().toLowerCase() };
  }
  if (!Array.isArray(typeValue)) {
    return {};
  }
  const parts = typeValue
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase());
  const nullable = parts.includes('null');
  const primary = parts.find((item) => item !== 'null');
  return {
    ...(primary ? { type: primary } : {}),
    ...(nullable ? { nullable: true } : {}),
  };
}

/**
 * Strip JSON Schema features Gemini Interactions rejects (anyOf, additionalProperties, $ref, etc.).
 */
export function sanitizeGeminiFunctionParameters(
  value: unknown,
  depth = 0,
): CustomFunctionDeclaration['parameters'] {
  if (depth > 8) {
    return { type: 'object', properties: {} };
  }

  const record = asRecord(value);
  if (!record) {
    return { type: 'object', properties: {} };
  }

  // Prefer a concrete object branch when unions are present.
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const variants = record[key];
    if (Array.isArray(variants)) {
      const objectish =
        variants.find((variant) => {
          const item = asRecord(variant);
          return Boolean(item && (item.type === 'object' || item.properties));
        }) ?? variants[0];
      return sanitizeGeminiFunctionParameters(objectish, depth + 1);
    }
  }

  const out: Record<string, unknown> = {};
  const { type, nullable } = normalizeSchemaType(record.type);
  out.type = type ?? 'object';
  if (nullable) out.nullable = true;

  if (typeof record.description === 'string' && record.description.trim()) {
    out.description = record.description.trim();
  }

  if (Array.isArray(record.enum)) {
    out.enum = record.enum.filter(
      (item) =>
        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
    );
  }

  for (const key of ['format', 'minimum', 'maximum', 'minItems', 'maxItems'] as const) {
    if (record[key] !== undefined && GEMINI_SCHEMA_KEYS.has(key)) {
      out[key] = record[key];
    }
  }

  const props = asRecord(record.properties);
  if (props) {
    const cleaned: Record<string, unknown> = {};
    for (const [propName, propSchema] of Object.entries(props)) {
      cleaned[propName] = sanitizeGeminiFunctionParameters(propSchema, depth + 1);
    }
    out.properties = cleaned;
  } else if (out.type === 'object') {
    out.properties = {};
  }

  if (record.items !== undefined) {
    out.items = sanitizeGeminiFunctionParameters(record.items, depth + 1);
  }

  if (Array.isArray(record.required)) {
    const required = record.required.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    if (required.length > 0) out.required = required;
  }

  return out as CustomFunctionDeclaration['parameters'];
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

  const parameters = sanitizeGeminiFunctionParameters(
    asRecord(record.parameters) ?? {
      type: 'object',
      properties: {},
    },
  );

  return {
    type: 'function',
    name,
    description,
    parameters,
  };
}

function toolkitPrefix(slug: string): string {
  return slug.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function isMetaComposioTool(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    upper.startsWith('COMPOSIO_') ||
    upper.includes('SEARCH_TOOLS') ||
    upper.includes('MULTI_EXECUTE') ||
    upper.includes('MANAGE_CONNECTIONS')
  );
}

function toolMatchesToolkit(name: string, slug: string): boolean {
  const upper = name.toUpperCase();
  const slugUpper = slug.toUpperCase();
  const compact = toolkitPrefix(slug);
  return (
    upper.startsWith(`${slugUpper}_`) ||
    upper.startsWith(`${compact}_`) ||
    upper.includes(`_${compact}_`)
  );
}

function capComposioDeclarations(
  declarations: CustomFunctionDeclaration[],
  connectedToolkitSlugs: string[],
): CustomFunctionDeclaration[] {
  if (declarations.length <= MAX_COMPOSIO_DECLARATIONS) {
    return declarations;
  }

  const selected: CustomFunctionDeclaration[] = [];
  const seen = new Set<string>();

  const take = (tool: CustomFunctionDeclaration) => {
    if (seen.has(tool.name) || selected.length >= MAX_COMPOSIO_DECLARATIONS) return;
    seen.add(tool.name);
    selected.push(tool);
  };

  for (const tool of declarations) {
    if (isMetaComposioTool(tool.name)) take(tool);
  }

  for (const slug of connectedToolkitSlugs) {
    for (const tool of declarations) {
      if (toolMatchesToolkit(tool.name, slug)) take(tool);
    }
  }

  for (const tool of declarations) {
    take(tool);
  }

  return selected;
}

type SessionLike = Awaited<ReturnType<typeof getOrCreateUserSession>>;

/**
 * Union local Supabase rows with Composio remote connected toolkits (UI may show
 * Connected from remote while our mirror row is missing), pin the full map, upsert gaps.
 */
async function syncAndPinConnectedAccounts(
  userId: string,
  session: SessionLike,
): Promise<{ connections: ComposioConnectionRow[]; connectedToolkitSlugs: string[] }> {
  const local = await listActiveConnections(userId);
  const bySlug = new Map(local.map((row) => [row.toolkit_slug, row]));

  try {
    const remote = await session.toolkits({ isConnected: true, limit: 50 });
    for (const item of remote.items ?? []) {
      const slug = typeof item.slug === 'string' ? item.slug.trim().toLowerCase() : '';
      if (!slug || item.isNoAuth) continue;
      const accountId = item.connection?.connectedAccount?.id?.trim();
      const active =
        item.connection?.isActive !== false &&
        Boolean(accountId) &&
        (item.connection?.connectedAccount?.status
          ? item.connection.connectedAccount.status.toUpperCase() === 'ACTIVE'
          : true);
      if (!active || !accountId) continue;

      const existing = bySlug.get(slug);
      if (existing && existing.connected_account_id === accountId) {
        continue;
      }

      bySlug.set(slug, {
        user_id: userId,
        toolkit_slug: slug,
        toolkit_name: item.name ?? existing?.toolkit_name ?? null,
        logo_url: item.logo ?? existing?.logo_url ?? null,
        connected_account_id: accountId,
        session_id: session.sessionId,
        status: 'active',
      });

      void upsertConnection({
        userId,
        toolkitSlug: slug,
        toolkitName: item.name ?? null,
        logoUrl: item.logo ?? null,
        connectedAccountId: accountId,
        sessionId: session.sessionId,
      }).catch((error) => {
        console.warn(
          '[composio/tools] upsert remote connection failed',
          slug,
          error instanceof Error ? error.message : error,
        );
      });
    }
  } catch (error) {
    console.warn(
      '[composio/tools] remote toolkit sync failed',
      error instanceof Error ? error.message : error,
    );
  }

  const connections = [...bySlug.values()];
  const connectedToolkitSlugs = connections.map((row) => row.toolkit_slug);

  if (connections.length > 0) {
    try {
      await session.update({
        manageConnections: false,
        connectedAccounts: buildConnectedAccountsMap(connections),
      });
    } catch {
      // Pinning is best-effort; tools may still resolve via userId-scoped accounts.
    }
  }

  return { connections, connectedToolkitSlugs };
}

export interface LoadedComposioTools {
  tools: CustomFunctionDeclaration[];
  connectedToolkitSlugs: string[];
}

/**
 * Load Gemini-ready Composio tools for a user.
 * Syncs remote Connected accounts into the session pin + Supabase mirror, sanitizes
 * schemas for Interactions, and caps declaration count.
 */
export async function loadComposioFunctionDeclarations(
  userId: string,
): Promise<LoadedComposioTools> {
  if (!isComposioToolsEnabled() || !userId) {
    return { tools: [], connectedToolkitSlugs: [] };
  }

  const session = await getOrCreateUserSession(userId);
  const { connectedToolkitSlugs } = await syncAndPinConnectedAccounts(userId, session);

  const rawTools = await session.tools();
  const list = Array.isArray(rawTools) ? rawTools : [];
  const declarations = list
    .map(mapGoogleDeclarationToCustom)
    .filter((tool): tool is CustomFunctionDeclaration => tool !== null);

  const capped = capComposioDeclarations(declarations, connectedToolkitSlugs);
  rememberComposioToolNames(capped.map((tool) => tool.name));
  return { tools: capped, connectedToolkitSlugs };
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
  connectedToolkitSlugs?: string[];
}): string {
  const namePreview =
    options.toolNames && options.toolNames.length > 0
      ? options.toolNames.slice(0, 40).join(', ')
      : '';

  const toolkitLine =
    options.connectedToolkitSlugs && options.connectedToolkitSlugs.length > 0
      ? `Pinned connected apps this turn: ${options.connectedToolkitSlugs.join(', ')}.`
      : 'No OAuth apps are pinned this turn (NO_AUTH / meta tools may still be present).';

  const availableLine =
    options.toolCount > 0
      ? `Connected-app / NO_AUTH tools available this turn (${options.toolCount}): ${namePreview}${
          options.toolNames && options.toolNames.length > 40 ? ', …' : ''
        }.`
      : 'No connected-app toolkit tools are loaded this turn (user may still have none connected, or only need Settings).';

  return `## Connected apps (Composio tools)
${toolkitLine}
${availableLine}

Composition (no hardcoded app pipelines — use tools that are actually on this turn):
- You may jumble Gemini native tools, custom tools, and these connected-app tools in any useful order in the same turn.
- Prefer a matching connected-app tool over native Search/URL when the user's intent clearly fits that toolkit (named app/API, crawl/scrape of a specific service, send/post via a connected account).
- Ambiguous open-web asks (e.g. "what's in the news about AI?") → use native Search; do not call connected-app tools just to discover a search toolkit.
- If the user needs an app/action and no matching function tool is available (e.g. email but Gmail is not among pinned apps) → briefly suggest Settings → Connection. Do not invent OAuth links or claim you completed the action.
- Connected-app gather → minutes-long research: call tools as needed, then delegateBackgroundTask with a rich objective that includes every relevant detail (and any later send/post intent).
- Native/custom results may feed connected-app tools and vice versa in the same function-call loop.

Never name Composio or internal tool plumbing to the user.`;
}
