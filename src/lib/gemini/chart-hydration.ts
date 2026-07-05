import {
  CHART_PALETTE,
  MAX_CHARTS,
  MAX_CHART_ROWS,
  type ChartKind,
  type ChartSeries,
  type ChartSpec,
} from '@/lib/charts/types';
import type { VoiceResponsePayload } from '@/lib/gemini/voice-response-schema';

const CHART_KINDS = new Set<ChartKind>(['bar', 'line', 'pie', 'area']);

const X_KEY_HINTS = new Set([
  'quarter',
  'month',
  'week',
  'day',
  'name',
  'category',
  'label',
  'period',
  'date',
  'x',
]);

interface InteractionWithSteps {
  steps?: unknown[];
}

export interface CodeExecutionContext {
  outputs: string[];
  codes: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function coerceRow(raw: unknown): Record<string, string | number> | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const row: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      row[key] = value;
    } else if (typeof value === 'string') {
      row[key] = value.trim();
    }
  }

  return Object.keys(row).length > 0 ? row : null;
}

function pythonLiteralToJson(text: string): string {
  return text
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value: string) =>
      JSON.stringify(value.replace(/\\'/g, "'")),
    );
}

function parseStructuredList(text: string): Record<string, string | number>[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[')) {
    return null;
  }

  const candidates = [trimmed, pythonLiteralToJson(trimmed)];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) {
        continue;
      }

      const rows = parsed
        .map((item) => coerceRow(item))
        .filter((row): row is Record<string, string | number> => row !== null);

      if (rows.length > 0) {
        return rows;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

function extractBracketList(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractListAssignmentFromCode(code: string): string | null {
  const match = code.match(/(?:^|\n)\s*[\w.]+\s*=\s*(\[[\s\S]*?\])\s*(?:\n|$)/m);
  return match?.[1] ?? null;
}

export function extractCodeExecutionContext(interactions: InteractionWithSteps[]): CodeExecutionContext {
  const outputs: string[] = [];
  const codes: string[] = [];

  for (const interaction of interactions) {
    for (const step of interaction.steps ?? []) {
      const record = asRecord(step);
      if (!record) {
        continue;
      }

      if (record.type === 'code_execution_result' && !record.is_error) {
        const result = typeof record.result === 'string' ? record.result.trim() : '';
        if (result) {
          outputs.push(result);
        }
      }

      if (record.type === 'code_execution_call') {
        const args = asRecord(record.arguments);
        const code = typeof args?.code === 'string' ? args.code.trim() : '';
        if (code) {
          codes.push(code);
        }
      }
    }
  }

  return { outputs, codes };
}

export function extractTabularRowsFromCodeExecution(context: CodeExecutionContext): Record<string, string | number>[] | null {
  for (const output of context.outputs) {
    const direct = parseStructuredList(output);
    if (direct?.length) {
      return direct;
    }

    const bracket = extractBracketList(output);
    if (bracket) {
      const parsed = parseStructuredList(bracket);
      if (parsed?.length) {
        return parsed;
      }
    }
  }

  for (const code of context.codes) {
    const assignment = extractListAssignmentFromCode(code);
    if (assignment) {
      const parsed = parseStructuredList(assignment);
      if (parsed?.length) {
        return parsed;
      }
    }

    const bracket = extractBracketList(code);
    if (bracket) {
      const parsed = parseStructuredList(bracket);
      if (parsed?.length) {
        return parsed;
      }
    }
  }

  return null;
}

function humanizeKey(key: string): string {
  const cleaned = key.replace(/_/g, ' ').trim();
  if (!cleaned) {
    return key;
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function inferXKey(rows: Record<string, string | number>[], preferred?: string): string | null {
  if (preferred && rows.every((row) => preferred in row)) {
    return preferred;
  }

  const keys = Object.keys(rows[0] ?? {});
  for (const key of keys) {
    if (X_KEY_HINTS.has(key.toLowerCase()) && rows.every((row) => typeof row[key] === 'string')) {
      return key;
    }
  }

  for (const key of keys) {
    if (rows.every((row) => typeof row[key] === 'string')) {
      return key;
    }
  }

  return null;
}

function inferSeriesKeys(
  rows: Record<string, string | number>[],
  xKey: string,
  preferredKeys?: string[],
): string[] {
  if (preferredKeys?.length) {
    const valid = preferredKeys.filter((key) =>
      rows.some((row) => typeof row[key] === 'number' && Number.isFinite(row[key])),
    );
    if (valid.length > 0) {
      return valid;
    }
  }

  const keys = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (key !== xKey && typeof value === 'number' && Number.isFinite(value)) {
        keys.add(key);
      }
    }
  }

  return [...keys];
}

function projectRows(
  rows: Record<string, string | number>[],
  xKey: string,
  seriesKeys: string[],
): Record<string, string | number>[] {
  return rows
    .slice(0, MAX_CHART_ROWS)
    .map((row) => {
      const projected: Record<string, string | number> = {};
      if (xKey in row) {
        projected[xKey] = row[xKey]!;
      }

      for (const key of seriesKeys) {
        const value = row[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          projected[key] = value;
        }
      }

      return projected;
    })
    .filter((row) => {
      if (!(xKey in row)) {
        return false;
      }
      return seriesKeys.some((key) => typeof row[key] === 'number');
    });
}

function parseSeries(raw: unknown, chartIndex: number): ChartSeries[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item, seriesIndex): ChartSeries | null => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }

      const key = typeof record.key === 'string' ? record.key.trim() : '';
      const label = typeof record.label === 'string' ? record.label.trim() : '';
      if (!key) {
        return null;
      }

      const color =
        typeof record.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(record.color.trim())
          ? record.color.trim()
          : CHART_PALETTE[(chartIndex + seriesIndex) % CHART_PALETTE.length];

      return { key, label: label || humanizeKey(key), color };
    })
    .filter((item): item is ChartSeries => item !== null);
}

function salvageChartShell(
  raw: unknown,
  rows: Record<string, string | number>[],
  index: number,
): ChartSpec | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const kindRaw = typeof record.kind === 'string' ? record.kind.trim() : 'bar';
  const kind = CHART_KINDS.has(kindRaw as ChartKind) ? (kindRaw as ChartKind) : 'bar';
  const title =
    typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Results';
  const id =
    typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `code-chart-${index + 1}`;

  const preferredXKey = typeof record.xKey === 'string' ? record.xKey.trim() : undefined;
  const xKey = inferXKey(rows, preferredXKey);
  if (!xKey) {
    return null;
  }

  let series = parseSeries(record.series, index);
  if (series.length === 0) {
    const keys = inferSeriesKeys(rows, xKey);
    series = keys.map((key, seriesIndex) => ({
      key,
      label: humanizeKey(key),
      color: CHART_PALETTE[(index + seriesIndex) % CHART_PALETTE.length],
    }));
  }

  const seriesKeys = series.map((item) => item.key);
  const data = projectRows(rows, xKey, seriesKeys);
  if (data.length === 0) {
    return null;
  }

  if (kind === 'pie') {
    const nameKey = typeof record.nameKey === 'string' ? record.nameKey.trim() : xKey;
    const valueKey =
      typeof record.valueKey === 'string' ? record.valueKey.trim() : seriesKeys[0] ?? undefined;

    return {
      id,
      title,
      kind,
      series,
      data,
      ...(nameKey ? { nameKey } : {}),
      ...(valueKey ? { valueKey } : {}),
    };
  }

  return {
    id,
    title,
    kind,
    series,
    data,
    xKey,
  };
}

function buildDefaultChart(rows: Record<string, string | number>[], index: number): ChartSpec | null {
  const xKey = inferXKey(rows);
  if (!xKey) {
    return null;
  }

  const seriesKeys = inferSeriesKeys(rows, xKey);
  if (seriesKeys.length === 0) {
    return null;
  }

  const series = seriesKeys.map((key, seriesIndex) => ({
    key,
    label: humanizeKey(key),
    color: CHART_PALETTE[(index + seriesIndex) % CHART_PALETTE.length],
  }));
  const data = projectRows(rows, xKey, seriesKeys);
  if (data.length === 0) {
    return null;
  }

  return {
    id: `code-chart-${index + 1}`,
    title: 'Results',
    kind: 'bar',
    xKey,
    series,
    data,
  };
}

export interface HydrateChartsOptions {
  usedCodeExecution: boolean;
  interactions: InteractionWithSteps[];
  rawCharts?: unknown;
}

export function hydrateChartsFromCodeExecution(
  payload: VoiceResponsePayload,
  options: HydrateChartsOptions,
): VoiceResponsePayload {
  if (!options.usedCodeExecution) {
    return payload;
  }

  const context = extractCodeExecutionContext(options.interactions);
  const rows = extractTabularRowsFromCodeExecution(context);
  if (!rows?.length) {
    return payload;
  }

  let charts = payload.charts;

  if (charts.length === 0 && Array.isArray(options.rawCharts)) {
    charts = options.rawCharts
      .slice(0, MAX_CHARTS)
      .map((raw, index) => salvageChartShell(raw, rows, index))
      .filter((chart): chart is ChartSpec => chart !== null);
  } else if (charts.length === 0) {
    const fallback = buildDefaultChart(rows, 0);
    charts = fallback ? [fallback] : [];
  }

  if (charts.length === 0) {
    return payload;
  }

  return {
    ...payload,
    charts,
    needs_visual_explanation: true,
  };
}
