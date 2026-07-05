import type { GoogleGenAI } from '@google/genai';

import { CHART_PALETTE, type ChartKind, type ChartSpec } from '@/lib/charts/types';
import { hydrateChartsFromCodeExecution } from '@/lib/gemini/chart-hydration';
import { formatToolSelection, type VoiceToolSelection } from '@/lib/gemini/tool-catalog';
import { runVoiceToolTurn, type DelegationPromptContext, type VoiceInteractionSnapshot } from '@/lib/gemini/response-prompt';
import type { ToolGroundingResult } from '@/lib/gemini/tool-grounding';
import type { UserContext } from '@/lib/gemini/user-context';
import type { VoiceResponsePayload } from '@/lib/gemini/voice-response-schema';

export interface ToolMatrixCase {
  id: string;
  category: string;
  transcript: string;
  userContext?: UserContext;
  hasImages?: boolean;
  imageCount?: number;
  /** Skip router and attach these tools directly. */
  forcedSelection?: VoiceToolSelection;
  skip?: () => boolean;
  delegation?: DelegationPromptContext;
}

export interface ToolMatrixExpect {
  expectSelection?: Partial<VoiceToolSelection>;
  expectGrounding?: Partial<
    Pick<
      ToolGroundingResult,
      'usedSearch' | 'usedMaps' | 'usedUrlContext' | 'usedCodeExecution' | 'usedCustomTools'
    >
  >;
  expectCustomTools?: string[];
  expectSpokenMatches?: RegExp;
  expectSpokenNotMatches?: RegExp;
  /** Live API cases should return a non-empty spoken_transcript. */
  expectSpokenNonEmpty?: boolean;
  maxDurationMs?: number;
  /** Minimum number of Recharts-ready charts in the response payload. */
  expectMinCharts?: number;
  /** Require needs_visual_explanation true when charts are expected. */
  expectVisualExplanation?: boolean;
  /** Each chart kind must be one of these when charts are present. */
  expectChartKinds?: ChartKind[];
  /** When true, missing native grounding is a warning, not a hard fail (Search/Maps can be flaky). */
  softNativeGrounding?: boolean;
  /** Retry once when charts are missing but expectMinCharts is set. */
  retryOnMissingCharts?: boolean;
  /** Warn instead of fail when code_execution ran but charts[] is still empty. */
  allowEmptyChartsWithCode?: boolean;
  /** Expect delegateBackgroundTask in customToolCalls. */
  expectDelegate?: boolean;
  /** Expect delegateBackgroundTask NOT in customToolCalls. */
  expectNoDelegate?: boolean;
}

export type ToolMatrixStatus = 'pass' | 'passWithWarning' | 'fail' | 'skipped';

export interface ChartSummary {
  id: string;
  title: string;
  kind: ChartKind;
  seriesKeys: string[];
  colors: string[];
  dataRows: number;
  xKey?: string;
  nameKey?: string;
  valueKey?: string;
}

export interface ToolMatrixResult {
  id: string;
  category: string;
  status: ToolMatrixStatus;
  durationMs: number;
  routeMs: number;
  llmMs: number;
  selection: VoiceToolSelection;
  rawSelection?: VoiceToolSelection;
  reasoning?: string | null;
  grounding: ToolGroundingResult;
  stepTypes: string[];
  customToolCalls: string[];
  toolsLabel: string;
  spokenPreview?: string;
  needsVisualExplanation?: boolean;
  chartCount?: number;
  charts?: ChartSummary[];
  warnings: string[];
  failures: string[];
  error?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function collectStepTypes(interactions: VoiceInteractionSnapshot[]): string[] {
  const seen = new Set<string>();
  const types: string[] = [];

  for (const interaction of interactions) {
    for (const step of interaction.steps ?? []) {
      const record = asRecord(step);
      const type = typeof record?.type === 'string' ? record.type : null;
      if (type && !seen.has(type)) {
        seen.add(type);
        types.push(type);
      }
    }
    for (const output of interaction.outputs ?? []) {
      const record = asRecord(output);
      const type = typeof record?.type === 'string' ? record.type : null;
      if (type && !seen.has(type)) {
        seen.add(type);
        types.push(type);
      }
    }
  }

  return types;
}

function selectionMatches(actual: VoiceToolSelection, expected: Partial<VoiceToolSelection>): string[] {
  const failures: string[] = [];
  for (const [key, value] of Object.entries(expected) as [keyof VoiceToolSelection, boolean][]) {
    if (actual[key] !== value) {
      failures.push(`selection.${key}: expected ${value}, got ${actual[key]}`);
    }
  }
  return failures;
}

function groundingMatches(
  actual: ToolGroundingResult,
  expected: NonNullable<ToolMatrixExpect['expectGrounding']>,
  softNative: boolean,
): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  const nativeKeys = new Set(['usedSearch', 'usedMaps', 'usedUrlContext', 'usedCodeExecution']);

  for (const [key, value] of Object.entries(expected) as [
    keyof ToolGroundingResult,
    boolean | undefined,
  ][]) {
    if (value === undefined || typeof actual[key] !== 'boolean') {
      continue;
    }
    if (actual[key] !== value) {
      const msg = `grounding.${key}: expected ${value}, got ${actual[key]}`;
      if (softNative && nativeKeys.has(key) && value === true) {
        warnings.push(msg);
      } else {
        failures.push(msg);
      }
    }
  }

  return { failures, warnings };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function summarizeCharts(charts: ChartSpec[]): ChartSummary[] {
  return charts.map((chart) => ({
    id: chart.id,
    title: chart.title,
    kind: chart.kind,
    seriesKeys: chart.series.map((series) => series.key),
    colors: chart.series.map((series) => series.color ?? ''),
    dataRows: chart.data.length,
    ...(chart.xKey ? { xKey: chart.xKey } : {}),
    ...(chart.nameKey ? { nameKey: chart.nameKey } : {}),
    ...(chart.valueKey ? { valueKey: chart.valueKey } : {}),
  }));
}

function validateCharts(payload: VoiceResponsePayload, expect: ToolMatrixExpect): string[] {
  const failures: string[] = [];

  if (expect.expectVisualExplanation && !payload.needs_visual_explanation) {
    failures.push('needs_visual_explanation: expected true, got false');
  }

  if (expect.expectMinCharts !== undefined && payload.charts.length < expect.expectMinCharts) {
    failures.push(
      `charts.length: expected >= ${expect.expectMinCharts}, got ${payload.charts.length}`,
    );
  }

  for (const chart of payload.charts) {
    if (expect.expectChartKinds?.length && !expect.expectChartKinds.includes(chart.kind)) {
      failures.push(`chart "${chart.id}" kind ${chart.kind} not in [${expect.expectChartKinds.join(', ')}]`);
    }

    if (chart.series.length === 0) {
      failures.push(`chart "${chart.id}" has no series`);
    }

    if (chart.data.length === 0) {
      failures.push(`chart "${chart.id}" has no data rows`);
    }

    if (chart.kind === 'pie') {
      const nameKey = chart.nameKey ?? 'name';
      const valueKey = chart.valueKey ?? 'value';
      const firstRow = chart.data[0];
      if (!firstRow || !(nameKey in firstRow) || !(valueKey in firstRow)) {
        failures.push(`chart "${chart.id}" pie missing nameKey/valueKey columns (${nameKey}, ${valueKey})`);
      }
    } else {
      const xKey = chart.xKey ?? 'name';
      const firstRow = chart.data[0];
      if (!firstRow || !(xKey in firstRow)) {
        failures.push(`chart "${chart.id}" ${chart.kind} missing xKey column "${xKey}"`);
      }
      for (const series of chart.series) {
        const row = chart.data[0];
        if (row && !(series.key in row)) {
          failures.push(`chart "${chart.id}" data missing series key "${series.key}"`);
        }
      }
    }

    for (const [index, series] of chart.series.entries()) {
      const color = series.color ?? CHART_PALETTE[index % CHART_PALETTE.length];
      if (!HEX_COLOR.test(color)) {
        failures.push(`chart "${chart.id}" series "${series.key}" has invalid color "${color}"`);
      }
    }
  }

  return failures;
}

export function buildChartSpecSmokePayload(): VoiceResponsePayload {
  return {
    needs_visual_explanation: true,
    explanation_text: 'Quarterly sales increased steadily from Q1 through Q4.',
    spoken_transcript: 'Sales grew each quarter, peaking at 210k in Q4.',
    delivery_tag: '[friendly]',
    charts: [
      {
        id: 'quarterly_sales',
        title: 'Quarterly Sales',
        kind: 'bar',
        xKey: 'quarter',
        series: [
          { key: 'sales', label: 'Sales (k$)', color: CHART_PALETTE[0] },
          { key: 'target', label: 'Target (k$)', color: CHART_PALETTE[1] },
        ],
        data: [
          { quarter: 'Q1', sales: 120, target: 110 },
          { quarter: 'Q2', sales: 150, target: 140 },
          { quarter: 'Q3', sales: 180, target: 170 },
          { quarter: 'Q4', sales: 210, target: 200 },
        ],
      },
    ],
    visual_image_groups: [],
  };
}

function runChartHydrationSmokeCase(testCase: ToolMatrixCase): {
  result: ToolMatrixResult;
  payload: VoiceResponsePayload;
} {
  const parsedPayload: VoiceResponsePayload = {
    needs_visual_explanation: true,
    explanation_text: 'Quarterly sales breakdown.',
    spoken_transcript: 'Sales grew each quarter.',
    delivery_tag: '[friendly]',
    charts: [],
    visual_image_groups: [],
  };

  const payload = hydrateChartsFromCodeExecution(parsedPayload, {
    usedCodeExecution: true,
    interactions: [
      {
        steps: [
          {
            type: 'code_execution_call',
            arguments: {
              code: `sales_data = [
    {"quarter": "Q1", "sales": 120},
    {"quarter": "Q2", "sales": 150},
    {"quarter": "Q3", "sales": 180},
    {"quarter": "Q4", "sales": 210}
]
print(sales_data)`,
            },
          },
          {
            type: 'code_execution_result',
            result:
              "[{'quarter': 'Q1', 'sales': 120}, {'quarter': 'Q2', 'sales': 150}, {'quarter': 'Q3', 'sales': 180}, {'quarter': 'Q4', 'sales': 210}]",
          },
        ],
      },
    ],
    rawCharts: [
      {
        id: 'quarterly_sales',
        title: 'Quarterly Sales (in thousands)',
        kind: 'bar',
        xKey: 'quarter',
        series: [{ key: 'sales', label: 'Sales' }],
        data: [{}, {}, {}, {}],
      },
    ],
  });

  return {
    payload,
    result: {
      id: testCase.id,
      category: testCase.category,
      status: 'pass',
      durationMs: 0,
      routeMs: 0,
      llmMs: 0,
      selection: {
        google_search: false,
        google_maps: false,
        url_context: false,
        code_execution: true,
        custom_tools: false,
      },
      grounding: {
        usedSearch: false,
        usedMaps: false,
        usedUrlContext: false,
        usedCodeExecution: true,
        usedCustomTools: false,
        webCitations: [],
        places: [],
        codeImages: [],
        customToolCalls: [],
        retrievedUrlCount: 0,
      },
      stepTypes: ['code_execution_call', 'code_execution_result'],
      customToolCalls: [],
      toolsLabel: 'offline-hydration',
      ...payloadFieldsFromTurn(payload),
      warnings: [],
      failures: [],
    },
  };
}

function runChartSpecSmokeCase(testCase: ToolMatrixCase): {
  result: ToolMatrixResult;
  payload: VoiceResponsePayload;
} {
  const payload = buildChartSpecSmokePayload();

  return {
    payload,
    result: {
      id: testCase.id,
      category: testCase.category,
      status: 'pass',
      durationMs: 0,
      routeMs: 0,
      llmMs: 0,
      selection: {
        google_search: false,
        google_maps: false,
        url_context: false,
        code_execution: false,
        custom_tools: false,
      },
      grounding: {
        usedSearch: false,
        usedMaps: false,
        usedUrlContext: false,
        usedCodeExecution: false,
        usedCustomTools: false,
        webCitations: [],
        places: [],
        codeImages: [],
        customToolCalls: [],
        retrievedUrlCount: 0,
      },
      stepTypes: [],
      customToolCalls: [],
      toolsLabel: 'offline-smoke',
      ...payloadFieldsFromTurn(payload),
      warnings: [],
      failures: [],
    },
  };
}

function payloadFieldsFromTurn(payload: VoiceResponsePayload): Pick<
  ToolMatrixResult,
  'spokenPreview' | 'needsVisualExplanation' | 'chartCount' | 'charts'
> {
  return {
    spokenPreview: payload.spoken_transcript,
    needsVisualExplanation: payload.needs_visual_explanation,
    chartCount: payload.charts.length,
    charts: summarizeCharts(payload.charts),
  };
}

export function assertToolMatrixResult(
  result: Omit<ToolMatrixResult, 'status' | 'warnings' | 'failures'>,
  expect: ToolMatrixExpect,
  payload?: VoiceResponsePayload,
): { status: ToolMatrixStatus; warnings: string[]; failures: string[] } {
  const warnings: string[] = [];
  const failures: string[] = [];

  if (expect.maxDurationMs && result.durationMs > expect.maxDurationMs) {
    warnings.push(`duration ${result.durationMs.toFixed(0)}ms exceeded ${expect.maxDurationMs}ms`);
  }

  if (expect.expectSelection) {
    failures.push(...selectionMatches(result.selection, expect.expectSelection));
  }

  if (expect.expectGrounding) {
    const groundingCheck = groundingMatches(
      result.grounding,
      expect.expectGrounding,
      expect.softNativeGrounding ?? false,
    );
    failures.push(...groundingCheck.failures);
    warnings.push(...groundingCheck.warnings);
  }

  if (expect.expectCustomTools?.length) {
    for (const name of expect.expectCustomTools) {
      if (!result.customToolCalls.includes(name)) {
        failures.push(`customToolCalls missing "${name}" (got: ${result.customToolCalls.join(', ') || 'none'})`);
      }
    }
  }

  if (expect.expectDelegate) {
    if (!result.customToolCalls.includes('delegateBackgroundTask')) {
      failures.push(
        `expected delegateBackgroundTask (got: ${result.customToolCalls.join(', ') || 'none'})`,
      );
    }
    if (result.spokenPreview && !/started|underway|working|few minutes|documents|background|progress/i.test(result.spokenPreview)) {
      failures.push(
        'spokenPreview: expected delegation acknowledgment (started/underway/documents/background)',
      );
    }
  }

  if (expect.expectNoDelegate && result.customToolCalls.includes('delegateBackgroundTask')) {
    failures.push('delegateBackgroundTask was called but should not have been delegated');
  }

  if (expect.expectSpokenMatches && result.spokenPreview) {
    if (!expect.expectSpokenMatches.test(result.spokenPreview)) {
      failures.push(`spokenPreview did not match ${expect.expectSpokenMatches}`);
    }
  }

  if (expect.expectSpokenNotMatches && result.spokenPreview) {
    if (expect.expectSpokenNotMatches.test(result.spokenPreview)) {
      failures.push(`spokenPreview unexpectedly matched ${expect.expectSpokenNotMatches}`);
    }
  }

  if (expect.expectSpokenNonEmpty && !result.spokenPreview?.trim()) {
    failures.push('spokenPreview: expected non-empty spoken_transcript');
  }

  if (
    payload &&
    (expect.expectMinCharts !== undefined ||
      expect.expectVisualExplanation ||
      expect.expectChartKinds?.length)
  ) {
    failures.push(...validateCharts(payload, expect));
  }

  if (
    expect.allowEmptyChartsWithCode &&
    expect.expectMinCharts !== undefined &&
    payload &&
    payload.charts.length < expect.expectMinCharts &&
    result.grounding.usedCodeExecution
  ) {
    const chartFailureIndex = failures.findIndex((failure) => failure.startsWith('charts.length'));
    if (chartFailureIndex >= 0) {
      warnings.push(`${failures[chartFailureIndex]} (code_execution ran; model omitted charts[])`);
      failures.splice(chartFailureIndex, 1);
    }
  }

  if (failures.length > 0) {
    return { status: 'fail', warnings, failures };
  }
  if (warnings.length > 0) {
    return { status: 'passWithWarning', warnings, failures };
  }
  return { status: 'pass', warnings, failures };
}

export async function runToolMatrixCase(
  client: GoogleGenAI,
  testCase: ToolMatrixCase,
): Promise<{ result: ToolMatrixResult; payload?: VoiceResponsePayload }> {
  if (testCase.id === 'chart-spec-smoke') {
    return runChartSpecSmokeCase(testCase);
  }

  if (testCase.id === 'chart-hydration-smoke') {
    return runChartHydrationSmokeCase(testCase);
  }

  if (testCase.skip?.()) {
    return {
      result: {
        id: testCase.id,
        category: testCase.category,
        status: 'skipped',
        durationMs: 0,
        routeMs: 0,
        llmMs: 0,
        selection: {
          google_search: false,
          google_maps: false,
          url_context: false,
          code_execution: false,
          custom_tools: false,
        },
        grounding: {
          usedSearch: false,
          usedMaps: false,
          usedUrlContext: false,
          usedCodeExecution: false,
          usedCustomTools: false,
          webCitations: [],
          places: [],
          codeImages: [],
          customToolCalls: [],
          retrievedUrlCount: 0,
        },
        stepTypes: [],
        customToolCalls: [],
        toolsLabel: 'none',
        warnings: [],
        failures: [],
      },
    };
  }

  const startedAt = performance.now();

  try {
    const turn = await runVoiceToolTurn(client, testCase.transcript, {
      userContext: testCase.userContext,
      selection: testCase.forcedSelection,
      hasImages: testCase.hasImages,
      imageCount: testCase.imageCount,
      delegation: testCase.delegation,
    });

    const stepTypes = collectStepTypes(turn.allInteractions);
    const durationMs = performance.now() - startedAt;

    return {
      payload: turn.payload,
      result: {
        id: testCase.id,
        category: testCase.category,
        status: 'pass',
        durationMs,
        routeMs: turn.routeMs,
        llmMs: turn.llmMs,
        selection: turn.selection,
        rawSelection: turn.rawSelection,
        reasoning: turn.reasoning,
        grounding: turn.grounding,
        stepTypes,
        customToolCalls: turn.grounding.customToolCalls,
        toolsLabel: formatToolSelection(turn.selection),
        ...payloadFieldsFromTurn(turn.payload),
        warnings: [],
        failures: [],
      },
    };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    const fallbackSelection = testCase.forcedSelection ?? {
      google_search: false,
      google_maps: false,
      url_context: false,
      code_execution: false,
      custom_tools: false,
    };
    return {
      result: {
        id: testCase.id,
        category: testCase.category,
        status: 'fail',
        durationMs,
        routeMs: 0,
        llmMs: durationMs,
        selection: fallbackSelection,
        toolsLabel: formatToolSelection(fallbackSelection),
        grounding: {
          usedSearch: false,
          usedMaps: false,
          usedUrlContext: false,
          usedCodeExecution: false,
          usedCustomTools: false,
          webCitations: [],
          places: [],
          codeImages: [],
          customToolCalls: [],
          retrievedUrlCount: 0,
        },
        stepTypes: [],
        customToolCalls: [],
        warnings: [],
        failures: [],
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function chartFailuresOnly(failures: string[]): boolean {
  return failures.every(
    (failure) =>
      failure.startsWith('charts.') ||
      failure.startsWith('needs_visual_explanation') ||
      failure.startsWith('chart "') ||
      failure.includes('invalid JSON'),
  );
}

export async function runToolMatrixCaseWithRetry(
  client: GoogleGenAI,
  testCase: ToolMatrixCase,
  expect: ToolMatrixExpect,
): Promise<ToolMatrixResult> {
  const maxAttempts =
    expect.retryOnMissingCharts && expect.expectMinCharts !== undefined ? 3 : 1;

  let lastResult: ToolMatrixResult | null = null;
  let lastAssertion = { status: 'fail' as ToolMatrixStatus, warnings: [] as string[], failures: [] as string[] };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { result, payload } = await runToolMatrixCase(client, testCase);
    lastResult = result;
    lastAssertion = assertToolMatrixResult(result, expect, payload);

    if (result.status === 'skipped') {
      return result;
    }

    if (result.error && !chartFailuresOnly([result.error, ...lastAssertion.failures])) {
      break;
    }

    if (lastAssertion.status !== 'fail' && !result.error) {
      break;
    }

    const retryForNative =
      expect.softNativeGrounding && lastAssertion.failures.every((f) => f.startsWith('grounding.'));
    const retryForCharts =
      expect.retryOnMissingCharts &&
      expect.expectMinCharts !== undefined &&
      chartFailuresOnly([...(result.error ? [result.error] : []), ...lastAssertion.failures]);

    if (!retryForNative && !retryForCharts) {
      break;
    }
  }

  if (!lastResult) {
    throw new Error('Tool matrix case did not run.');
  }

  return {
    ...lastResult,
    status: lastResult.error ? 'fail' : lastAssertion.status,
    warnings: [...lastResult.warnings, ...lastAssertion.warnings],
    failures: lastResult.error ? [lastResult.error, ...lastAssertion.failures] : lastAssertion.failures,
  };
}
