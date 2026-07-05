import { isBackgroundJobsEnabled } from '@/lib/background-jobs/kickoff';
import { EMPTY_TOOL_SELECTION, type VoiceToolSelection } from '@/lib/gemini/tool-catalog';
import type { DelegationPromptContext } from '@/lib/gemini/response-prompt';
import type { ToolMatrixCase, ToolMatrixExpect } from '@/lib/gemini/tool-test-harness';

export interface DelegationMatrixEntry {
  case: ToolMatrixCase;
  expect: ToolMatrixExpect;
}

function customToolsOnly(): VoiceToolSelection {
  return { ...EMPTY_TOOL_SELECTION, custom_tools: true };
}

function customToolsAndCode(): VoiceToolSelection {
  return { ...EMPTY_TOOL_SELECTION, custom_tools: true, code_execution: true };
}

export function buildDelegationMatrixEntries(
  delegation: DelegationPromptContext,
): DelegationMatrixEntry[] {
  const withDelegation = (testCase: Omit<ToolMatrixCase, 'delegation'>): ToolMatrixCase => ({
    ...testCase,
    delegation,
  });

  return [
    {
      case: withDelegation({
        id: 'delegate-research-report',
        category: 'should-delegate',
        transcript: 'Research AI startups building browser agents and prepare a full comparison report',
        forcedSelection: customToolsOnly(),
      }),
      expect: {
        expectDelegate: true,
        maxDurationMs: 120_000,
      },
    },
    {
      case: withDelegation({
        id: 'delegate-study-kit',
        category: 'should-delegate',
        transcript: 'I have a quantum mechanics exam tomorrow, prepare me a complete study kit',
        forcedSelection: customToolsOnly(),
      }),
      expect: {
        expectDelegate: true,
        maxDurationMs: 120_000,
      },
    },
    {
      case: withDelegation({
        id: 'delegate-trip-plan',
        category: 'should-delegate',
        transcript: 'Plan me a five-day trip to Japan under 1500 dollars',
        forcedSelection: customToolsOnly(),
      }),
      expect: {
        expectDelegate: true,
        maxDurationMs: 120_000,
      },
    },
    {
      case: withDelegation({
        id: 'no-delegate-calculator',
        category: 'should-not-delegate',
        transcript: 'What is 15 percent of 280?',
        forcedSelection: customToolsOnly(),
      }),
      expect: {
        expectNoDelegate: true,
        expectCustomTools: ['calculator'],
        maxDurationMs: 90_000,
      },
    },
    {
      case: withDelegation({
        id: 'no-delegate-greeting',
        category: 'should-not-delegate',
        transcript: 'Hey, how are you?',
        forcedSelection: customToolsOnly(),
      }),
      expect: {
        expectNoDelegate: true,
        expectSpokenNonEmpty: true,
        maxDurationMs: 60_000,
      },
    },
    {
      case: withDelegation({
        id: 'no-delegate-static-fact',
        category: 'should-not-delegate',
        transcript: 'What is the capital of France?',
        forcedSelection: customToolsOnly(),
      }),
      expect: {
        expectNoDelegate: true,
        maxDurationMs: 60_000,
      },
    },
    {
      case: withDelegation({
        id: 'no-delegate-convert',
        category: 'should-not-delegate',
        transcript: 'Convert 72 Fahrenheit to Celsius',
        forcedSelection: customToolsOnly(),
      }),
      expect: {
        expectNoDelegate: true,
        expectCustomTools: ['convert'],
        maxDurationMs: 90_000,
      },
    },
    {
      case: withDelegation({
        id: 'no-delegate-python',
        category: 'should-not-delegate',
        transcript: 'Calculate the sum of 12, 34, and 56 using Python',
        forcedSelection: customToolsAndCode(),
      }),
      expect: {
        expectNoDelegate: true,
        expectGrounding: { usedCodeExecution: true },
        softNativeGrounding: true,
        maxDurationMs: 120_000,
      },
    },
  ];
}

export function getDelegationMatrixEntries(
  delegation: DelegationPromptContext,
  filterId?: string,
): DelegationMatrixEntry[] {
  const entries = buildDelegationMatrixEntries(delegation);
  if (!filterId) return entries;
  return entries.filter((entry) => entry.case.id === filterId);
}

export function isDelegationMatrixEnabled(): boolean {
  return isBackgroundJobsEnabled();
}
