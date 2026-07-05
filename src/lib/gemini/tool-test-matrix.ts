import { getOpenWeatherApiKey } from '@/lib/gemini/config';
import { EMPTY_TOOL_SELECTION, type VoiceToolSelection } from '@/lib/gemini/tool-catalog';
import type { ToolMatrixCase, ToolMatrixExpect } from '@/lib/gemini/tool-test-harness';
import { buildUserContext, type UserContext } from '@/lib/gemini/user-context';

export interface ToolMatrixEntry {
  case: ToolMatrixCase;
  expect: ToolMatrixExpect;
}

const PARIS_USER_CONTEXT: UserContext = buildUserContext({
  userTimezone: 'Europe/Paris',
  userLocale: 'en-US',
  clientTimestamp: new Date().toISOString(),
  userLatitude: '48.8566',
  userLongitude: '2.3522',
});

function allToolsOff(): VoiceToolSelection {
  return { ...EMPTY_TOOL_SELECTION };
}

function selection(overrides: Partial<VoiceToolSelection>): VoiceToolSelection {
  return { ...EMPTY_TOOL_SELECTION, ...overrides };
}

export const TOOL_MATRIX_ENTRIES: ToolMatrixEntry[] = [
  // A. Solo native
  {
    case: {
      id: 'solo-search',
      category: 'solo-native',
      transcript: "What's in the news about AI today?",
    },
    expect: {
      expectSelection: { google_search: true },
      expectGrounding: { usedSearch: true },
      softNativeGrounding: true,
      maxDurationMs: 90_000,
    },
  },
  {
    case: {
      id: 'solo-maps',
      category: 'solo-native',
      transcript: 'Best coffee near me',
      userContext: PARIS_USER_CONTEXT,
    },
    expect: {
      expectSelection: { google_maps: true, google_search: false },
      expectGrounding: { usedMaps: true },
      softNativeGrounding: true,
      maxDurationMs: 90_000,
    },
  },
  {
    case: {
      id: 'solo-url',
      category: 'solo-native',
      transcript: 'Summarize https://example.com',
    },
    expect: {
      expectSelection: { url_context: true },
      expectGrounding: { usedUrlContext: true },
      softNativeGrounding: true,
      maxDurationMs: 90_000,
    },
  },
  {
    case: {
      id: 'solo-code',
      category: 'solo-native',
      transcript: 'Calculate the sum of 12, 34, and 56 using Python',
    },
    expect: {
      expectSelection: { code_execution: true },
      expectGrounding: { usedCodeExecution: true },
      softNativeGrounding: true,
      maxDurationMs: 90_000,
    },
  },
  {
    case: {
      id: 'chart-spec-smoke',
      category: 'chart-smoke',
      transcript: 'offline Recharts spec validation',
    },
    expect: {
      expectMinCharts: 1,
      expectVisualExplanation: true,
      expectChartKinds: ['bar'],
    },
  },
  {
    case: {
      id: 'chart-hydration-smoke',
      category: 'chart-smoke',
      transcript: 'offline chart hydration from code execution output',
    },
    expect: {
      expectMinCharts: 1,
      expectVisualExplanation: true,
      expectChartKinds: ['bar'],
    },
  },
  {
    case: {
      id: 'solo-code-chart',
      category: 'solo-native',
      transcript:
        'Using Python, compute quarterly sales in thousands: Q1 120, Q2 150, Q3 180, Q4 210. ' +
        'In charts[], return one bar chart with xKey "quarter", series key "sales", and data rows ' +
        '[{"quarter":"Q1","sales":120},{"quarter":"Q2","sales":150},{"quarter":"Q3","sales":180},{"quarter":"Q4","sales":210}].',
      forcedSelection: selection({ code_execution: true }),
    },
    expect: {
      expectSelection: { code_execution: true },
      expectGrounding: { usedCodeExecution: true },
      expectMinCharts: 1,
      expectVisualExplanation: true,
      expectChartKinds: ['bar', 'line', 'area'],
      retryOnMissingCharts: true,
      allowEmptyChartsWithCode: true,
      softNativeGrounding: true,
      maxDurationMs: 120_000,
    },
  },

  // B. Solo custom
  {
    case: {
      id: 'solo-calc',
      category: 'solo-custom',
      transcript: 'What is 15% of 280?',
    },
    expect: {
      expectSelection: { custom_tools: true, code_execution: false },
      expectGrounding: { usedCustomTools: true },
      expectCustomTools: ['calculator'],
      maxDurationMs: 60_000,
    },
  },
  {
    case: {
      id: 'solo-date',
      category: 'solo-custom',
      transcript: 'What day is it today in my timezone?',
      userContext: PARIS_USER_CONTEXT,
    },
    expect: {
      expectSelection: { custom_tools: true },
      expectGrounding: { usedCustomTools: true },
      expectCustomTools: ['processDate'],
      maxDurationMs: 60_000,
    },
  },
  {
    case: {
      id: 'solo-convert',
      category: 'solo-custom',
      transcript: 'Convert 10 miles to kilometers',
    },
    expect: {
      expectSelection: { custom_tools: true },
      expectGrounding: { usedCustomTools: true },
      expectCustomTools: ['convert'],
      maxDurationMs: 60_000,
    },
  },
  {
    case: {
      id: 'solo-random',
      category: 'solo-custom',
      transcript: 'Pick one for me: pizza, sushi, or tacos',
    },
    expect: {
      expectSelection: { custom_tools: true },
      expectGrounding: { usedCustomTools: true },
      expectCustomTools: ['randomChoice'],
      maxDurationMs: 60_000,
    },
  },
  {
    case: {
      id: 'solo-context',
      category: 'solo-custom',
      transcript: 'What timezone am I in right now?',
      userContext: PARIS_USER_CONTEXT,
    },
    expect: {
      expectSelection: { custom_tools: true },
      expectGrounding: { usedCustomTools: true },
      expectCustomTools: ['getUserContext'],
      maxDurationMs: 60_000,
    },
  },
  {
    case: {
      id: 'solo-weather',
      category: 'solo-custom',
      transcript: "What's the weather in Paris?",
      skip: () => !getOpenWeatherApiKey(),
    },
    expect: {
      expectSelection: { custom_tools: true },
      expectGrounding: { usedCustomTools: true },
      expectCustomTools: ['getWeather'],
      maxDurationMs: 60_000,
    },
  },

  // C. Native + native
  {
    case: {
      id: 'pair-search-url',
      category: 'pair-native',
      transcript: 'Search for the Example domain homepage, then summarize example.com',
      forcedSelection: selection({ google_search: true, url_context: true }),
    },
    expect: {
      expectSelection: { google_search: true, url_context: true },
      expectGrounding: { usedSearch: true, usedUrlContext: true },
      softNativeGrounding: true,
      maxDurationMs: 120_000,
    },
  },

  // D. Native + custom
  {
    case: {
      id: 'pair-search-custom',
      category: 'pair-native-custom',
      transcript: "Look up today's EUR to USD rate and convert 100 euros to dollars",
      forcedSelection: selection({ google_search: true, custom_tools: true }),
    },
    expect: {
      expectSelection: { google_search: true, custom_tools: true },
      expectGrounding: { usedSearch: true, usedCustomTools: true },
      expectCustomTools: ['convert'],
      softNativeGrounding: true,
      maxDurationMs: 120_000,
    },
  },
  {
    case: {
      id: 'pair-maps-custom',
      category: 'pair-native-custom',
      transcript: 'Find pharmacies near me, then pick one at random from the results',
      userContext: PARIS_USER_CONTEXT,
      forcedSelection: selection({ google_maps: true, custom_tools: true }),
    },
    expect: {
      expectSelection: { google_maps: true, custom_tools: true },
      expectGrounding: { usedMaps: true, usedCustomTools: true },
      expectCustomTools: ['randomChoice'],
      softNativeGrounding: true,
      maxDurationMs: 120_000,
    },
  },

  // E. Custom multi-function
  {
    case: {
      id: 'custom-chain',
      category: 'custom-chain',
      transcript: 'Convert 100 miles to km, then tell me 10% of that distance in kilometers',
      forcedSelection: selection({ custom_tools: true }),
    },
    expect: {
      expectSelection: { custom_tools: true },
      expectGrounding: { usedCustomTools: true },
      expectCustomTools: ['convert', 'calculator'],
      maxDurationMs: 90_000,
    },
  },

  // F. Request fidelity
  {
    case: {
      id: 'request-fidelity-troubleshoot',
      category: 'request-fidelity',
      transcript:
        'My phone only charges when I hold the cable at an angle. How should I figure out what is wrong?',
      forcedSelection: allToolsOff(),
    },
    expect: {
      expectSelection: allToolsOff(),
      expectSpokenMatches: /\b(charg(?:e|er|ing)|cable|port|connection|angle)\b/i,
      maxDurationMs: 45_000,
    },
  },
  {
    case: {
      id: 'request-fidelity-no-self-intro',
      category: 'request-fidelity',
      transcript: 'Give me two quick tips to keep basil alive indoors.',
      forcedSelection: allToolsOff(),
    },
    expect: {
      expectSelection: allToolsOff(),
      expectSpokenMatches: /\b(basil|water|light|soil|indoors|plant)\b/i,
      expectSpokenNotMatches: /^\s*(?:i[' ]?m|i am)\s+chrysty\b/i,
      maxDurationMs: 45_000,
    },
  },

  // G. Routing sanity
  {
    case: {
      id: 'route-none',
      category: 'routing',
      transcript: 'Hey, how are you?',
    },
    expect: {
      expectSelection: allToolsOff(),
      maxDurationMs: 45_000,
    },
  },
  {
    case: {
      id: 'route-geo-not-search',
      category: 'routing',
      transcript: 'Best coffee near me',
      userContext: PARIS_USER_CONTEXT,
    },
    expect: {
      expectSelection: { google_maps: true, google_search: false },
      maxDurationMs: 45_000,
    },
  },
  {
    case: {
      id: 'route-math-not-code',
      category: 'routing',
      transcript: 'What is 15% of 280?',
    },
    expect: {
      expectSelection: { custom_tools: true, code_execution: false },
      maxDurationMs: 45_000,
    },
  },
];

export function getToolMatrixEntries(filterId?: string): ToolMatrixEntry[] {
  const entries = filterId
    ? TOOL_MATRIX_ENTRIES.filter((entry) => entry.case.id === filterId)
    : TOOL_MATRIX_ENTRIES;

  return entries.map((entry) => ({
    ...entry,
    expect:
      entry.case.id === 'chart-spec-smoke' || entry.case.id === 'chart-hydration-smoke'
        ? entry.expect
        : { expectSpokenNonEmpty: true, ...entry.expect },
  }));
}
