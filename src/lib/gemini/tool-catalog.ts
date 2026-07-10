import {
  getOpenWeatherApiKey,
  isGeminiCodeExecutionEnabled,
  isGeminiCustomToolsEnabled,
  isGeminiGoogleMapsEnabled,
  isGeminiGoogleSearchEnabled,
  isGeminiUrlContextEnabled,
} from '@/lib/gemini/config';
import { hasCustomToolsAvailable } from '@/lib/gemini/custom-tools';
import { isBackgroundJobsEnabled } from '@/lib/background-jobs/kickoff';

export type ToolId =
  | 'google_search'
  | 'google_maps'
  | 'url_context'
  | 'code_execution'
  | 'custom_tools';

export interface VoiceToolSelection {
  google_search: boolean;
  google_maps: boolean;
  url_context: boolean;
  code_execution: boolean;
  custom_tools: boolean;
}

export const EMPTY_TOOL_SELECTION: VoiceToolSelection = {
  google_search: false,
  google_maps: false,
  url_context: false,
  code_execution: false,
  custom_tools: false,
};

export interface ToolCatalogExample {
  transcript: string;
  select: boolean;
  why: string;
}

export interface ToolCatalogEntry {
  id: ToolId;
  label: string;
  category: 'web' | 'geo' | 'compute';
  bestFor: string;
  doNotUseFor: string;
  customFunctions?: string[];
  enabled: () => boolean;
  conflictsWith: ToolId[];
  pairsWellWith: ToolId[];
  examples: ToolCatalogExample[];
}

const CUSTOM_FUNCTION_NAMES = [
  'calculator',
  'processDate',
  'convert',
  'randomChoice',
  'getUserContext',
  'manage_capability',
  ...(getOpenWeatherApiKey() ? (['getWeather'] as const) : []),
  ...(isBackgroundJobsEnabled() ? (['delegateBackgroundTask'] as const) : []),
];

const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'google_search',
    label: 'Google Search',
    category: 'web',
    bestFor: 'Live news, prices, events, recalls, product compatibility, manual discovery, safety updates, discovery when no URL is named',
    doNotUseFor: 'Places/near me, pure image description, static general knowledge, reading a known URL',
    enabled: isGeminiGoogleSearchEnabled,
    conflictsWith: ['google_maps', 'url_context'],
    pairsWellWith: ['url_context', 'custom_tools'],
    examples: [
      { transcript: "What's in the news about AI today?", select: true, why: 'Live news needs Search' },
      { transcript: 'What is the capital of France?', select: false, why: 'Static knowledge' },
      { transcript: 'Find recipe pages comparing pasta carbonara', select: true, why: 'Discovery before URL read' },
      { transcript: 'Find the manual for this pump model', select: true, why: 'Manual discovery' },
      { transcript: 'Are there recalls for this ladder model?', select: true, why: 'Current safety/recall info' },
      { transcript: 'Hey, how are you?', select: false, why: 'Greeting' },
    ],
  },
  {
    id: 'google_maps',
    label: 'Google Maps',
    category: 'geo',
    bestFor: 'Near me, directions, stores/supplies, repair shops, POI, itineraries, opening hours for places',
    doNotUseFor: 'News, broad web facts, URL reading, or replacing camera analysis (Maps may coexist with relevant camera evidence)',
    enabled: isGeminiGoogleMapsEnabled,
    conflictsWith: ['google_search', 'url_context'],
    pairsWellWith: ['custom_tools'],
    examples: [
      { transcript: 'Best coffee near me', select: true, why: 'Local place query' },
      { transcript: 'Directions to the nearest pharmacy', select: true, why: 'Directions' },
      { transcript: 'Where can I buy a replacement brake cable nearby?', select: true, why: 'Nearby supplies' },
      { transcript: "What's the weather in Paris?", select: false, why: 'Use custom_tools getWeather instead' },
      { transcript: 'Summarize example.com/docs', select: false, why: 'URL task, not Maps' },
    ],
  },
  {
    id: 'url_context',
    label: 'URL context',
    category: 'web',
    bestFor: 'Spoken/named URLs, deep read or compare specific pages, manuals, instructions, spec pages, text visible on camera',
    doNotUseFor: 'Broad discovery without URLs, places/near me, simple chat',
    enabled: isGeminiUrlContextEnabled,
    conflictsWith: ['google_maps'],
    pairsWellWith: ['google_search'],
    examples: [
      { transcript: 'Summarize w w w dot example dot com slash docs', select: true, why: 'Explicit URL' },
      { transcript: 'Compare ingredients on these two recipe pages I linked', select: true, why: 'Deep page read' },
      { transcript: 'Read the installation guide at this URL and tell me step two', select: true, why: 'Specific URL/manual' },
      { transcript: 'Find articles about climate change', select: false, why: 'Discovery — use Search first' },
      { transcript: 'What is this plant?', select: false, why: 'Vision only' },
    ],
  },
  {
    id: 'code_execution',
    label: 'Code execution',
    category: 'compute',
    bestFor: 'Receipt totals, multi-line sums, measurements, material estimates, statistics, charts, multi-step data transforms',
    doNotUseFor: 'Single arithmetic, percentages, unit/date conversion, random picks, pure visual inspection',
    enabled: isGeminiCodeExecutionEnabled,
    conflictsWith: ['custom_tools'],
    pairsWellWith: [],
    examples: [
      { transcript: 'Add up all the line items on this receipt', select: true, why: 'Multi-step totals + optional chart' },
      { transcript: 'Break down these sales numbers into a chart', select: true, why: 'Data viz' },
      { transcript: 'Calculate how many boards I need from these dimensions', select: true, why: 'Multi-step material estimate' },
      { transcript: 'What is 15% of 280?', select: false, why: 'Simple math — use custom_tools calculator' },
      { transcript: 'Convert 10 miles to kilometers', select: false, why: 'Use custom_tools convert' },
    ],
  },
  {
    id: 'custom_tools',
    label: 'Custom function tools',
    category: 'compute',
    bestFor:
      'Single-step calculator, dates, unit/currency convert, measurement conversion, random choice, weather, device/user context, and delegating big multi-minute objectives (research reports, comparisons, study kits, trip plans) to the background crew via delegateBackgroundTask',
    doNotUseFor: 'Multi-row receipts, charts, heavy data analysis',
    customFunctions: [...CUSTOM_FUNCTION_NAMES],
    enabled: () => isGeminiCustomToolsEnabled() && hasCustomToolsAvailable(),
    conflictsWith: ['code_execution'],
    pairsWellWith: ['google_search', 'google_maps'],
    examples: [
      { transcript: 'What is 15% of 280?', select: true, why: 'calculator' },
      { transcript: 'What time is it in Tokyo?', select: true, why: 'processDate' },
      { transcript: 'Convert 100 USD to EUR', select: true, why: 'convert' },
      { transcript: 'Convert 3/8 inch to millimeters', select: true, why: 'convert' },
      { transcript: 'Pick random between pizza, sushi, and tacos', select: true, why: 'randomChoice' },
      { transcript: 'Add up every item on this receipt photo', select: false, why: 'Use code_execution' },
      ...(isBackgroundJobsEnabled()
        ? [
            {
              transcript: 'Research all AI startups building browser agents and prepare a full report',
              select: true,
              why: 'delegateBackgroundTask — multi-minute research outcome',
            },
            {
              transcript: 'I have a quantum mechanics exam tomorrow, prepare me a complete study kit',
              select: true,
              why: 'delegateBackgroundTask — multi-artifact workspace',
            },
            {
              transcript: 'Plan me a five-day trip to Japan under 1500 dollars',
              select: true,
              why: 'delegateBackgroundTask — deep plan with research',
            },
            {
              transcript: 'Research the products in this photo and prepare a full comparison report',
              select: true,
              why: 'delegateBackgroundTask — photo-based deep work (describe the images in visualContext)',
            },
          ]
        : []),
    ],
  },
];

const ALLOWED_PAIRS: [ToolId, ToolId][] = [
  ['google_search', 'url_context'],
  ['google_search', 'custom_tools'],
  ['google_maps', 'custom_tools'],
];

const TOOL_PRIORITY: ToolId[] = [
  'code_execution',
  'google_maps',
  'url_context',
  'google_search',
  'custom_tools',
];

export function getAvailableTools(): ToolCatalogEntry[] {
  return TOOL_CATALOG.filter((entry) => entry.enabled());
}

export function listAvailableToolIds(): ToolId[] {
  return getAvailableTools().map((entry) => entry.id);
}

export function formatToolSelection(selection: VoiceToolSelection): string {
  const names = listAvailableToolIds().filter((id) => selection[id]);
  return names.length > 0 ? names.join(', ') : 'none';
}

export function buildToolCatalogForRouter(): string {
  const available = getAvailableTools();
  if (available.length === 0) {
    return 'No tools are enabled in this deployment.';
  }

  const sections = available.map((entry) => {
    const exampleLines = entry.examples
      .map((ex) => `  - "${ex.transcript}" → ${ex.select ? 'YES' : 'NO'} (${ex.why})`)
      .join('\n');

    const customLine = entry.customFunctions?.length
      ? `\n  Functions: ${entry.customFunctions.join(', ')}`
      : '';

    return [
      `### ${entry.id} (${entry.label}) [${entry.category}]`,
      `Best for: ${entry.bestFor}`,
      `Do NOT use for: ${entry.doNotUseFor}`,
      `Conflicts with (pick one per task): ${entry.conflictsWith.join(', ') || 'none'}`,
      `Pairs well with: ${entry.pairsWellWith.join(', ') || 'none'}${customLine}`,
      'Examples:',
      exampleLines,
    ].join('\n');
  });

  const workedExamples = [
    '| Transcript | Select |',
    '|------------|--------|',
    '| "Hey, how are you?" | none |',
    '| "What is 15% of 280?" | custom_tools only |',
    '| "Best coffee near me" | google_maps only |',
    '| "What\'s in the news about AI?" | google_search only |',
    '| "Find recipes then compare two pages" | google_search + url_context |',
    '| "Add up this receipt" (with image) | code_execution only |',
  ].join('\n');

  return [
    '## Available tools (only select from this list)',
    '',
    ...sections,
    '',
    '## Worked routing examples',
    workedExamples,
  ].join('\n\n');
}

export function clampSelectionToEnv(selection: VoiceToolSelection): VoiceToolSelection {
  return {
    google_search: selection.google_search && isGeminiGoogleSearchEnabled(),
    google_maps: selection.google_maps && isGeminiGoogleMapsEnabled(),
    url_context: selection.url_context && isGeminiUrlContextEnabled(),
    code_execution: selection.code_execution && isGeminiCodeExecutionEnabled(),
    custom_tools:
      selection.custom_tools && isGeminiCustomToolsEnabled() && hasCustomToolsAvailable(),
  };
}

export function hasSelectedToolsEnabled(selection: VoiceToolSelection): boolean {
  const clamped = clampSelectionToEnv(selection);
  return (
    clamped.google_search ||
    clamped.google_maps ||
    clamped.url_context ||
    clamped.code_execution ||
    clamped.custom_tools
  );
}

function normalizeTranscript(transcript: string): string {
  return transcript.trim().toLowerCase();
}

function isSimpleMath(transcript: string): boolean {
  const t = normalizeTranscript(transcript);
  return (
    /\d+\s*%\s*of\s*\d+/.test(t) ||
    /what(?:'s| is)\s+\d+\s*(plus|minus|times|divided by|\*|\+|\-|\/)\s*\d+/.test(t) ||
    /(calculate|compute)\s+\d+\s*[\+\-\*\/]\s*\d+/.test(t) ||
    (/^(what(?:'s| is)\s+)?\d+(\.\d+)?\s*(\+|\-|\*|\/|plus|minus|times|divided by)\s*\d+(\.\d+)?\??$/.test(t))
  );
}

function isHeavyCompute(transcript: string, hasImages: boolean): boolean {
  const t = normalizeTranscript(transcript);
  const keywords =
    /\b(receipt|invoice|bill|total|sum|add up|breakdown|chart|graph|statistics|each line|line items|compare.*numbers|calculate.*all|material estimate|how many boards|how much material|measurements|dimensions)\b/.test(
      t,
    );
  return keywords || (hasImages && /\b(receipt|invoice|bill|total|add up|sum)\b/.test(t));
}

function isGeoQuery(transcript: string): boolean {
  const t = normalizeTranscript(transcript);
  return (
    /\b(near me|nearby|closest|directions? to|how do i get to|restaurant|cafe|coffee shop|pharmacy|hotel|open now|opening hours)\b/.test(
      t,
    ) ||
    /\b(where can i buy|buy.*nearby|replacement.*nearby|repair shop|hardware store|parts store|supplier)\b/.test(t) ||
    /\b(in|around)\s+[a-z]{3,}\b/.test(t)
  );
}

function isSearchQuery(transcript: string): boolean {
  const t = normalizeTranscript(transcript);
  return (
    /\b(news|headlines|what happened|latest|today|price|stock|score|event|schedule|when is|who won|recall|manual|model number|compatible|compatibility|replacement part|part number|safety notice)\b/.test(
      t,
    ) || /\b(search for|find articles|look up|discover)\b/.test(t)
  );
}

function hasSpokenUrl(transcript: string): boolean {
  const t = normalizeTranscript(transcript);
  return (
    /\b(https?:\/\/|w w w|www\.|dot com|dot org|\.com|\.org|\.io|this page|that site|that url|these pages)\b/.test(
      t,
    )
  );
}

function isDiscoveryQuery(transcript: string): boolean {
  const t = normalizeTranscript(transcript);
  return /\b(find|search for|look for|discover)\b/.test(t) && !hasSpokenUrl(transcript);
}

/** Substantial multi-minute outcomes that should reach delegateBackgroundTask (custom_tools). */
function isLikelyDelegationQuery(transcript: string): boolean {
  if (!isBackgroundJobsEnabled()) return false;
  const t = normalizeTranscript(transcript);
  return /\b(report|research|deep dive|comparison|compare (all|every|these)|study kit|lesson plan|trip plan|plan (me|a|my)|prepare (me|a)|write (me|a)|put together)\b/.test(
    t,
  );
}

function isPureVisionQuery(transcript: string, hasImages: boolean): boolean {
  if (!hasImages) return false;
  const t = normalizeTranscript(transcript);
  const visionOnly =
    /\b(what is this|what's this|read this|identify|describe|look at|in this (photo|image|picture)|on the screen|what do you see)\b/.test(
      t,
    );
  const needsTools =
    isSearchQuery(transcript) ||
    isGeoQuery(transcript) ||
    hasSpokenUrl(transcript) ||
    isHeavyCompute(transcript, hasImages) ||
    isSimpleMath(transcript) ||
    isLikelyDelegationQuery(transcript);
  return visionOnly && !needsTools;
}

function countEnabled(selection: VoiceToolSelection): number {
  return (
    Number(selection.google_search) +
    Number(selection.google_maps) +
    Number(selection.url_context) +
    Number(selection.code_execution) +
    Number(selection.custom_tools)
  );
}

function trimToAllowedPair(selection: VoiceToolSelection): VoiceToolSelection {
  const enabled = listAvailableToolIds().filter((id) => selection[id]);
  if (enabled.length <= 2) {
    return selection;
  }

  for (const [a, b] of ALLOWED_PAIRS) {
    if (selection[a] && selection[b]) {
      const keep = new Set<ToolId>([a, b]);
      const next = { ...EMPTY_TOOL_SELECTION };
      for (const id of keep) {
        next[id] = true;
      }
      return clampSelectionToEnv(next);
    }
  }

  const sorted = enabled.sort(
    (a, b) => TOOL_PRIORITY.indexOf(a) - TOOL_PRIORITY.indexOf(b),
  );
  const next = { ...EMPTY_TOOL_SELECTION };
  next[sorted[0]!] = true;
  return clampSelectionToEnv(next);
}

export function resolveToolSelection(
  raw: VoiceToolSelection,
  context: { transcript: string; hasImages: boolean },
): VoiceToolSelection {
  let selection = clampSelectionToEnv(raw);
  const { transcript, hasImages } = context;

  if (isPureVisionQuery(transcript, hasImages)) {
    return EMPTY_TOOL_SELECTION;
  }

  if (selection.code_execution && selection.custom_tools) {
    if (isSimpleMath(transcript) && !isHeavyCompute(transcript, hasImages)) {
      selection = { ...selection, code_execution: false };
    } else if (isHeavyCompute(transcript, hasImages)) {
      selection = { ...selection, custom_tools: false };
    } else {
      selection = { ...selection, code_execution: false };
    }
  }

  if (selection.google_maps && selection.google_search) {
    if (isGeoQuery(transcript) && !isSearchQuery(transcript)) {
      selection = { ...selection, google_search: false };
    } else if (isSearchQuery(transcript) && !isGeoQuery(transcript)) {
      selection = { ...selection, google_maps: false };
    } else if (isGeoQuery(transcript)) {
      selection = { ...selection, google_search: false };
    } else {
      selection = { ...selection, google_maps: false };
    }
  }

  if (selection.url_context && selection.google_search) {
    if (hasSpokenUrl(transcript) && !isDiscoveryQuery(transcript)) {
      selection = { ...selection, google_search: false };
    } else if (isDiscoveryQuery(transcript) && !hasSpokenUrl(transcript)) {
      selection = { ...selection, url_context: false };
    } else if (hasSpokenUrl(transcript)) {
      selection = { ...selection, google_search: false };
    } else {
      selection = { ...selection, url_context: false };
    }
  }

  if (countEnabled(selection) > 2) {
    selection = trimToAllowedPair(selection);
  }

  return clampSelectionToEnv(selection);
}

export function buildRouterSystemInstruction(): string {
  const availableIds = listAvailableToolIds();

  return [
    'You route voice assistant requests to the minimum set of tools needed.',
    'DEFAULT: select NO tools. Most voice turns are greetings, chat, or answerable without tools.',
    'Select tools when the user asks for current facts, prices, recalls, nearby places, calculations, or anything requiring verification — do not answer from stale training data when a tool would help.',
    '',
    'Decision checklist:',
    '- Pick at most ONE tool per category: web discovery (google_search) | geo (google_maps) | URL read (url_context) | simple compute (custom_tools) | heavy compute (code_execution).',
    '- Never enable two tools that solve the same task (e.g. google_search + google_maps for "coffee near me").',
    '- Only combine tools when the request clearly needs a pipeline (e.g. google_search then url_context).',
    '- For physical tasks with camera images, select no tools for pure visual identification, diagnosis from visible evidence, or step guidance based only on what is shown.',
    '- Select tools when the physical task needs current facts, manuals, product compatibility, recalls, nearby supplies/services, measurements, conversions, weather, or calculations.',
    '- Selecting geo/search/tools never removes camera evidence. Route the required tool and keep response_surface=camera when spatial or visible-scene guidance still matters.',
    '- Geographic precedence: an explicit place named by the user or established in the current conversation beats device coordinates. Device coordinates are only for genuine current-location intent. If a required place is ambiguous, ask one clarification downstream; never infer a random/default city.',
    '- Classify the task semantically; do not route from isolated keywords.',
    '- execution_lane=immediate for quick answers, structured for rich answers completed now, and background only for outcomes that genuinely need minutes.',
    '- response_surface=voice for short answers, camera for spatial coaching, canvas for equations/charts/comparisons/long explanations, and document for durable background artifacts.',
    '- Set requires_chart=true only when the requested answer should contain a real data chart; this guarantees code execution and chart hydration.',
    '',
    `Only these tool IDs may be true: ${availableIds.join(', ') || 'none'}.`,
    '',
    buildToolCatalogForRouter(),
    '',
    'Return JSON with boolean tool fields, task_class, execution_lane, response_surface, requires_chart, and a short reasoning string.',
  ].join('\n');
}
