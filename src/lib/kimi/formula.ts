import { getMoonshotApiKey, getMoonshotBaseUrl } from './client';
import { withKimiRetry } from './retry';

const TOOL_CACHE_TTL_MS = 10 * 60 * 1000;

export interface FormulaJsonSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface FormulaToolDefinition {
  name: string;
  description: string;
  parameters: FormulaJsonSchema;
  uri: string;
}

interface ToolCacheEntry {
  tools: FormulaToolDefinition[];
  loadedAt: number;
}

const toolCache = new Map<string, ToolCacheEntry>();

export function normalizeFormulaUri(uri: string): string {
  let normalized = uri.trim();
  if (!normalized) throw new Error('Formula URI cannot be empty');
  if (!normalized.includes('/')) {
    normalized = `moonshot/${normalized}`;
  }
  if (!normalized.includes(':')) {
    normalized = `${normalized}:latest`;
  }
  return normalized;
}

/** Official Moonshot formula tools made available to background agents. */
export function getBackgroundFormulaUris(): string[] {
  const raw = process.env.KIMI_BACKGROUND_FORMULAS?.trim();
  const fallback = [
    'moonshot/web-search:latest',
    'moonshot/fetch:latest',
    'moonshot/rethink:latest',
    'moonshot/date:latest',
    'moonshot/convert:latest',
    'moonshot/code-runner:latest',
    'moonshot/quickjs:latest',
    'moonshot/excel:latest',
    'moonshot/base64:latest',
    'moonshot/random-choice:latest',
  ];
  const list = raw
    ? raw.split(',').map((item) => item.trim()).filter(Boolean)
    : fallback;
  return [...new Set(list.map(normalizeFormulaUri))];
}

interface RawFormulaTool {
  type?: string;
  function?: {
    name?: string;
    description?: string;
    parameters?: FormulaJsonSchema;
  };
}

async function fetchFormulaTools(uri: string): Promise<FormulaToolDefinition[]> {
  const cached = toolCache.get(uri);
  if (cached && Date.now() - cached.loadedAt < TOOL_CACHE_TTL_MS) {
    return cached.tools;
  }

  const baseUrl = getMoonshotBaseUrl();
  const response = await withKimiRetry(async () => {
    const res = await fetch(`${baseUrl}/formulas/${encodeURIComponent(uri)}/tools`, {
      headers: { Authorization: `Bearer ${getMoonshotApiKey()}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to load tools for ${uri}: ${res.status} ${text}`);
    }
    return res;
  });

  const data = (await response.json()) as { tools?: RawFormulaTool[] };
  const tools: FormulaToolDefinition[] = [];

  for (const tool of data.tools ?? []) {
    const func = tool.type === 'function' ? tool.function : undefined;
    if (!func?.name) continue;
    tools.push({
      name: func.name,
      description: func.description ?? '',
      parameters: func.parameters ?? { type: 'object', properties: {} },
      uri,
    });
  }

  toolCache.set(uri, { tools, loadedAt: Date.now() });
  return tools;
}

function formulaAliasUri(uri: string): string | null {
  if (uri.includes('code_runner')) return uri.replace('code_runner', 'code-runner');
  if (uri.includes('code-runner')) return uri.replace('code-runner', 'code_runner');
  if (uri.includes('random_choice')) return uri.replace('random_choice', 'random-choice');
  if (uri.includes('random-choice')) return uri.replace('random-choice', 'random_choice');
  return null;
}

function isFormulaNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('404') || message.includes('formula not found');
}

async function fetchFormulaToolsResilient(uri: string): Promise<FormulaToolDefinition[]> {
  try {
    return await fetchFormulaTools(uri);
  } catch (error) {
    if (!isFormulaNotFoundError(error)) throw error;

    const alias = formulaAliasUri(uri);
    if (alias && alias !== uri) {
      try {
        return await fetchFormulaTools(alias);
      } catch (aliasError) {
        if (!isFormulaNotFoundError(aliasError)) throw aliasError;
      }
    }

    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`Skipping unavailable formula ${uri}: ${detail}`);
    return [];
  }
}

/** Loads all tool definitions across formulas; skips unavailable formulas and duplicate tool names. */
export async function loadFormulaToolDefinitions(uris: string[]): Promise<FormulaToolDefinition[]> {
  const unique = [...new Set(uris.map(normalizeFormulaUri))];
  const tools: FormulaToolDefinition[] = [];
  const seen = new Set<string>();

  const results = await Promise.allSettled(unique.map((uri) => fetchFormulaToolsResilient(uri)));
  for (const result of results) {
    if (result.status !== 'fulfilled') {
      console.warn('Formula load failed:', result.reason);
      continue;
    }
    for (const tool of result.value) {
      if (seen.has(tool.name)) continue;
      seen.add(tool.name);
      tools.push(tool);
    }
  }

  return tools;
}

interface FiberResponse {
  status?: string;
  context?: {
    output?: string;
    encrypted_output?: string;
    error?: string;
  };
  error?: string;
}

/** Executes an official Moonshot formula tool (fiber) server-side and returns its output. */
export async function callFormulaFiber(
  uri: string,
  name: string,
  args: Record<string, unknown> | string,
): Promise<string> {
  const normalizedUri = normalizeFormulaUri(uri);
  const baseUrl = getMoonshotBaseUrl();
  const argumentsJson = typeof args === 'string' ? args : JSON.stringify(args);

  const response = await withKimiRetry(async () => {
    const res = await fetch(`${baseUrl}/formulas/${encodeURIComponent(normalizedUri)}/fibers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getMoonshotApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, arguments: argumentsJson }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fiber call failed for ${name}: ${res.status} ${text}`);
    }
    return res;
  });

  const fiber = (await response.json()) as FiberResponse;

  if (fiber.status !== 'succeeded') {
    const err =
      fiber.error ??
      fiber.context?.error ??
      fiber.context?.output ??
      `Fiber status: ${fiber.status ?? 'unknown'}`;
    throw new Error(String(err));
  }

  const output = fiber.context?.encrypted_output ?? fiber.context?.output;
  if (output == null || output === '') {
    throw new Error(`Fiber ${name} returned empty output`);
  }

  return typeof output === 'string' ? output : JSON.stringify(output);
}
