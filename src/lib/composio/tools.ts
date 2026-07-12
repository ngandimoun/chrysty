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

export function isMetaComposioToolName(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    upper.startsWith('COMPOSIO_') ||
    upper.includes('SEARCH_TOOLS') ||
    upper.includes('MULTI_EXECUTE') ||
    upper.includes('GET_TOOL_SCHEMAS') ||
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

/** Prefer read/list/send actions so the 16-tool Gemini cap stays useful. */
function composioToolPriority(name: string): number {
  const tokens = name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const has = (...needles: string[]) => needles.some((needle) => tokens.includes(needle));

  if (
    has(
      'FETCH',
      'LIST',
      'FIND',
      'SEARCH',
      'GET',
      'READ',
      'SEND',
      'FREEBUSY',
      'EVENTS',
    ) ||
    (has('CREATE') && has('EVENT')) ||
    (has('FIND') && has('EVENT')) ||
    (has('QUICK') && has('ADD'))
  ) {
    // Demote destructive / noisy list ops (CALENDAR_LIST_DELETE, *_WATCH, ACL_*).
    if (has('DELETE', 'DESTROY', 'REVOKE', 'WATCH') || tokens.includes('ACL')) {
      return 3;
    }
    return 0;
  }
  if (has('CREATE', 'UPDATE', 'MODIFY', 'PATCH', 'INSERT', 'FORWARD', 'REPLY', 'DRAFT')) {
    return 1;
  }
  if (has('DELETE', 'DESTROY', 'REVOKE', 'WATCH') || tokens.includes('ACL')) {
    return 3;
  }
  return 2;
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

  // Round-robin across connected toolkits, highest-priority tools first.
  if (connectedToolkitSlugs.length > 0) {
    const perToolkit = connectedToolkitSlugs.map((slug) =>
      declarations
        .filter((tool) => toolMatchesToolkit(tool.name, slug))
        .sort(
          (a, b) =>
            composioToolPriority(a.name) - composioToolPriority(b.name) ||
            a.name.localeCompare(b.name),
        ),
    );
    let index = 0;
    let progressed = true;
    while (selected.length < MAX_COMPOSIO_DECLARATIONS && progressed) {
      progressed = false;
      for (const tools of perToolkit) {
        if (selected.length >= MAX_COMPOSIO_DECLARATIONS) break;
        const tool = tools[index];
        if (tool) {
          const before = selected.length;
          take(tool);
          if (selected.length > before) progressed = true;
        }
      }
      index += 1;
    }
  }

  const remaining = [...declarations].sort(
    (a, b) =>
      composioToolPriority(a.name) - composioToolPriority(b.name) ||
      a.name.localeCompare(b.name),
  );
  for (const tool of remaining) {
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
        toolkits: connectedToolkitSlugs,
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
  metaOnly: boolean;
}

/**
 * Load Gemini-ready Composio tools for a user.
 * Uses DIRECT_TOOLS sessions (app tools only), syncs remote Connected accounts into the
 * session pin + Supabase mirror, drops any residual COMPOSIO_* meta tools, sanitizes and
 * caps schemas for Gemini Interactions.
 */
export async function loadComposioFunctionDeclarations(
  userId: string,
): Promise<LoadedComposioTools> {
  if (!isComposioToolsEnabled() || !userId) {
    return { tools: [], connectedToolkitSlugs: [], metaOnly: false };
  }

  const session = await getOrCreateUserSession(userId);
  const { connectedToolkitSlugs } = await syncAndPinConnectedAccounts(userId, session);

  const rawTools = await session.tools();
  const list = Array.isArray(rawTools) ? rawTools : [];
  const declarations = list
    .map(mapGoogleDeclarationToCustom)
    .filter((tool): tool is CustomFunctionDeclaration => tool !== null)
    .filter((tool) => !isMetaComposioToolName(tool.name));

  const selected = capComposioDeclarations(declarations, connectedToolkitSlugs);
  const approxSchemaBytes = JSON.stringify(selected).length;

  rememberComposioToolNames(selected.map((tool) => tool.name));
  console.info('[composio/tools] loaded', {
    toolCount: selected.length,
    metaOnly: false,
    connectedToolkitSlugs,
    approxSchemaBytes,
    toolNames: selected.map((tool) => tool.name).slice(0, 20),
  });
  return {
    tools: selected,
    connectedToolkitSlugs,
    metaOnly: false,
  };
}

function normalizeExecuteResult(result: unknown): unknown {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result) as unknown;
    } catch {
      return result;
    }
  }
  return result;
}

export async function executeComposioToolCall(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    const session = await getOrCreateUserSession(userId);
    const executed = await session.execute(name, args);
    if (executed?.error) {
      throw new Error(executed.error);
    }
    return executed?.data ?? executed;
  } catch (sessionError) {
    console.warn(
      '[composio/tools] session.execute failed; falling back to provider',
      name,
      sessionError instanceof Error ? sessionError.message : sessionError,
    );
    const composio = getComposioClient();
    const result = await composio.provider.executeToolCall(userId, {
      name,
      args,
    });
    return normalizeExecuteResult(result);
  }
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
  /** True when OAuth apps are pinned but tool declarations were stripped for this turn. */
  toolsTemporarilyUnavailable?: boolean;
}): string {
  const pinned = options.connectedToolkitSlugs ?? [];
  const hasPins = pinned.length > 0;
  const namePreview =
    options.toolNames && options.toolNames.length > 0
      ? options.toolNames.slice(0, 40).join(', ')
      : '';

  const toolkitLine = hasPins
    ? `Pinned connected apps this turn (already linked — do NOT tell the user to connect these): ${pinned.join(', ')}.`
    : 'No OAuth apps are pinned this turn.';

  let availableLine: string;
  if (options.toolsTemporarilyUnavailable && hasPins) {
    availableLine =
      'Connected-app function tools are temporarily unavailable this turn even though the apps above are linked. Tell the user to try again shortly — do NOT say they need to connect or open Settings for those pinned apps.';
  } else if (options.toolCount > 0) {
    availableLine = `Connected-app tools available this turn (${options.toolCount}): ${namePreview}${
      options.toolNames && options.toolNames.length > 40 ? ', …' : ''
    }.`;
  } else if (hasPins) {
    availableLine =
      'Pinned apps are linked, but no app tools were loaded this turn. Ask the user to try again — do NOT claim they are disconnected.';
  } else {
    availableLine =
      'No connected-app toolkit tools are loaded this turn (user may still have none connected, or only need Settings).';
  }

  const appGuidance = hasPins
    ? `- For pinned apps (e.g. gmail, googlecalendar): you MUST call the matching direct tools on this turn (e.g. GMAIL_*, GOOGLECALENDAR_*) before answering. Never say access is missing for a pinned app.
- Only suggest Settings → Connection when the user needs an app that is NOT in the pinned list above.`
    : `- If the user needs an app/action and no matching function tool is available → briefly suggest Settings → Connection. Do not invent OAuth links or claim you completed the action.`;

  const hitchBan =
    options.toolCount > 0
      ? `- When connected-app tools are listed above, you MUST call a matching tool to get real data before answering.
- Do NOT invent or speak any of these failure narratives: "technical hitch", "temporary sync delay", "sync delay", "permission error", "permissions aren't set", "try again later", "give it a moment", or similar. Those are not real when tools are available — call the tool instead.`
      : '';

  return `## Connected apps (Composio tools)
${toolkitLine}
${availableLine}

Composition (no hardcoded app pipelines — use tools that are actually on this turn):
- You may jumble Gemini native tools, custom tools, and these connected-app tools in any useful order in the same turn.
- Prefer a matching connected-app tool over native Search/URL when the user's intent clearly fits a pinned toolkit (email, calendar, named app/API, send/post via a connected account).
- Ambiguous open-web asks (e.g. "what's in the news about AI?") → use native Search; do not call connected-app tools just to discover a search toolkit.
${appGuidance}
${hitchBan}
- Connected-app gather → minutes-long research: call tools as needed, then delegateBackgroundTask with a rich objective that includes every relevant detail (and any later send/post intent).
- Native/custom results may feed connected-app tools and vice versa in the same function-call loop.

Never name Composio or internal tool plumbing to the user.`;
}
