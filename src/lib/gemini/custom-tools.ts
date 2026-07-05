import { createBackgroundJob } from '@/lib/background-jobs/db';
import { isBackgroundJobsEnabled, kickoffJobLegSafe } from '@/lib/background-jobs/kickoff';
import { getOpenWeatherApiKey, isGeminiCustomToolsEnabled } from '@/lib/gemini/config';
import { evaluateExpression } from '@/lib/gemini/tools/calculator';
import { convertUnits, type ConvertCategory } from '@/lib/gemini/tools/convert';
import {
  processDate,
  type DateAction,
  type DateFormat,
  type DateUnit,
} from '@/lib/gemini/tools/process-date';
import { randomChoice } from '@/lib/gemini/tools/random-choice';
import type { UserContext } from '@/lib/gemini/user-context';
import { fetchCurrentWeather } from '@/lib/gemini/weather';

export const GET_USER_CONTEXT_TOOL = 'getUserContext';
export const GET_WEATHER_TOOL = 'getWeather';
export const CALCULATOR_TOOL = 'calculator';
export const PROCESS_DATE_TOOL = 'processDate';
export const CONVERT_TOOL = 'convert';
export const RANDOM_CHOICE_TOOL = 'randomChoice';
export const DELEGATE_BACKGROUND_TASK_TOOL = 'delegateBackgroundTask';

export interface DelegationToolContext {
  astraKey: string;
  workspaceId: string;
  userId?: string;
  /** Base URL for the self-chaining background runner. */
  origin: string;
}

export interface CustomToolContext {
  userContext: UserContext;
  delegation?: DelegationToolContext;
}

export interface CustomFunctionDeclaration {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
    required?: string[];
  };
}

export interface CustomToolDefinition {
  declaration: CustomFunctionDeclaration;
  handler: (args: Record<string, unknown>, ctx: CustomToolContext) => Promise<unknown>;
}

const CUSTOM_TOOL_NAMES = new Set<string>();

export function isRegisteredCustomToolName(name: string): boolean {
  return CUSTOM_TOOL_NAMES.has(name);
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function getUserContextHandler(_args: Record<string, unknown>, ctx: CustomToolContext): Promise<unknown> {
  const { userContext } = ctx;
  return Promise.resolve({
    timezone: userContext.timezone,
    locale: userContext.locale,
    localDateTime: userContext.localDateTimeLabel,
    utcTimestamp: userContext.clientTimestamp,
    ...(userContext.coordinates
      ? {
          coordinates: {
            latitude: userContext.coordinates.latitude,
            longitude: userContext.coordinates.longitude,
            ...(userContext.coordinates.accuracyMeters !== undefined
              ? { accuracyMeters: userContext.coordinates.accuracyMeters }
              : {}),
          },
        }
      : {}),
  });
}

async function getWeatherHandler(args: Record<string, unknown>, ctx: CustomToolContext): Promise<unknown> {
  const location = parseString(args.location);
  const latitude = parseNumber(args.latitude) ?? ctx.userContext.coordinates?.latitude;
  const longitude = parseNumber(args.longitude) ?? ctx.userContext.coordinates?.longitude;

  return fetchCurrentWeather({ location, latitude, longitude });
}

function calculatorHandler(args: Record<string, unknown>): Promise<unknown> {
  const expression = parseString(args.expression);
  if (!expression) {
    throw new Error('calculator requires an expression.');
  }

  return Promise.resolve(evaluateExpression(expression));
}

function processDateHandler(args: Record<string, unknown>, ctx: CustomToolContext): Promise<unknown> {
  const action = parseString(args.action) as DateAction | undefined;
  if (!action) {
    throw new Error('processDate requires an action.');
  }

  return Promise.resolve(
    processDate(
      {
        action,
        reference: parseString(args.reference),
        amount: parseNumber(args.amount),
        unit: parseString(args.unit) as DateUnit | undefined,
        timezone: parseString(args.timezone),
        otherTimezone: parseString(args.otherTimezone),
        format: parseString(args.format) as DateFormat | undefined,
      },
      ctx.userContext,
    ),
  );
}

async function convertHandler(args: Record<string, unknown>): Promise<unknown> {
  const category = parseString(args.category) as ConvertCategory | undefined;
  const value = parseNumber(args.value);
  const from = parseString(args.from);
  const to = parseString(args.to);

  if (!category || value === undefined || !from || !to) {
    throw new Error('convert requires category, value, from, and to.');
  }

  return convertUnits({ category, value, from, to });
}

function randomChoiceHandler(args: Record<string, unknown>): Promise<unknown> {
  const items = parseStringArray(args.items);
  const count = parseNumber(args.count);
  const allowDuplicates = args.allowDuplicates === true;

  return Promise.resolve(randomChoice({ items, ...(count !== undefined ? { count } : {}), allowDuplicates }));
}

async function delegateBackgroundTaskHandler(
  args: Record<string, unknown>,
  ctx: CustomToolContext,
): Promise<unknown> {
  const objective = parseString(args.objective);
  const title = parseString(args.title) ?? 'Background task';
  const visualContext = parseString(args.visualContext);

  if (!objective) {
    throw new Error('delegateBackgroundTask requires an objective.');
  }

  if (!ctx.delegation) {
    return {
      status: 'unavailable',
      message:
        'Background delegation is not available for this session. Answer directly instead and tell the user delegation is unavailable right now.',
    };
  }

  // The background crew cannot see images, so photo content arrives as text.
  const fullObjective = visualContext
    ? `${objective}\n\nVisual context from the user's photos (described by the voice assistant, the crew cannot see the images):\n${visualContext}`
    : objective;

  const job = await createBackgroundJob({
    workspaceId: ctx.delegation.workspaceId,
    astraKey: ctx.delegation.astraKey,
    userId: ctx.delegation.userId,
    title: title.slice(0, 80),
    objective: fullObjective,
    origin: ctx.delegation.origin,
  });

  kickoffJobLegSafe(job.id, ctx.delegation.origin);

  return {
    status: 'started',
    jobId: job.id,
    title: job.title,
    message:
      'The background crew has started working. Tell the user the work is underway, roughly what will be produced, and that the finished workspace will appear in their Documents. They can keep talking to you meanwhile.',
  };
}

function buildToolDefinitions(): CustomToolDefinition[] {
  return [
    {
      declaration: {
        type: 'function',
        name: GET_USER_CONTEXT_TOOL,
        description:
          'Returns the user device context: timezone, locale, local date/time, and optional GPS coordinates from this request.',
        parameters: { type: 'object', properties: {} },
      },
      handler: getUserContextHandler,
    },
    {
      declaration: {
        type: 'function',
        name: CALCULATOR_TOOL,
        description:
          'Evaluates a safe arithmetic expression for simple math. Prefer over code_execution for basic calculations.',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Arithmetic expression, e.g. "280 * 0.15", "sqrt(144)", "(12 + 8) / 2"',
            },
          },
          required: ['expression'],
        },
      },
      handler: calculatorHandler,
    },
    {
      declaration: {
        type: 'function',
        name: PROCESS_DATE_TOOL,
        description:
          'Processes dates and times using the user timezone. Supports now, format, add, diff, and convert_timezone.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'now | format | add | diff | convert_timezone',
            },
            reference: { type: 'string', description: 'ISO 8601 reference date/time' },
            amount: { type: 'number', description: 'Amount to add (for add action)' },
            unit: {
              type: 'string',
              description: 'minutes | hours | days | weeks | months | years',
            },
            timezone: { type: 'string', description: 'IANA timezone, defaults to user timezone' },
            otherTimezone: { type: 'string', description: 'Target timezone for convert_timezone' },
            format: { type: 'string', description: 'date | time | datetime | weekday' },
          },
          required: ['action'],
        },
      },
      handler: processDateHandler,
    },
    {
      declaration: {
        type: 'function',
        name: CONVERT_TOOL,
        description:
          'Converts units for length, mass, temperature, volume, or live currency exchange rates.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'length | mass | temperature | volume | currency',
            },
            value: { type: 'number', description: 'Numeric value to convert' },
            from: { type: 'string', description: 'Source unit or currency code' },
            to: { type: 'string', description: 'Target unit or currency code' },
          },
          required: ['category', 'value', 'from', 'to'],
        },
      },
      handler: convertHandler,
    },
    {
      declaration: {
        type: 'function',
        name: RANDOM_CHOICE_TOOL,
        description: 'Randomly selects one or more items from a list.',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'string' },
              description: 'Choices to pick from (2-20 non-empty strings)',
            },
            count: { type: 'number', description: 'How many picks to return (default 1)' },
            allowDuplicates: {
              type: 'string',
              description: 'Set true to allow duplicate picks',
            },
          },
          required: ['items'],
        },
      },
      handler: randomChoiceHandler,
    },
    ...(isBackgroundJobsEnabled()
      ? [
          {
            declaration: {
              type: 'function',
              name: DELEGATE_BACKGROUND_TASK_TOOL,
              description:
                'Delegates a substantial objective to the autonomous background crew (Kimi agents) that researches the web, analyzes, and creates a workspace of documents over several minutes while the conversation continues. Use for deep research, reports, comparisons, study kits, plans, and other multi-artifact outcomes — never for quick questions. Returns immediately with a job id; respond by telling the user the work has started.',
              parameters: {
                type: 'object',
                properties: {
                  objective: {
                    type: 'string',
                    description:
                      'Complete, self-contained restatement of what the user wants, including any relevant context from the conversation (constraints, budget, dates, prior work). The background crew only sees this text.',
                  },
                  title: {
                    type: 'string',
                    description: 'Short workspace title, 3-6 words, e.g. "Japan Trip Plan"',
                  },
                  visualContext: {
                    type: 'string',
                    description:
                      'REQUIRED whenever the user captured photos relevant to the task. The background crew cannot see images, so describe everything task-relevant in detail: visible text, brand/product names, prices, quantities, locations, layout, condition, colors, and anything the user pointed at or annotated.',
                  },
                },
                required: ['objective', 'title'],
              },
            },
            handler: delegateBackgroundTaskHandler,
          } satisfies CustomToolDefinition,
        ]
      : []),
    ...(getOpenWeatherApiKey()
      ? [
          {
            declaration: {
              type: 'function',
              name: GET_WEATHER_TOOL,
              description:
                'Returns current weather for a location name or coordinates. Use after Search when precise conditions are needed.',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'City and region, e.g. Utqiagvik, AK',
                  },
                  latitude: {
                    type: 'number',
                    description: 'Latitude when known',
                  },
                  longitude: {
                    type: 'number',
                    description: 'Longitude when known',
                  },
                },
              },
            },
            handler: getWeatherHandler,
          } satisfies CustomToolDefinition,
        ]
      : []),
  ];
}

const TOOL_REGISTRY = new Map<string, CustomToolDefinition>();

for (const tool of buildToolDefinitions()) {
  TOOL_REGISTRY.set(tool.declaration.name, tool);
  CUSTOM_TOOL_NAMES.add(tool.declaration.name);
}

export function hasCustomToolsAvailable(): boolean {
  return isGeminiCustomToolsEnabled() && TOOL_REGISTRY.size > 0;
}

export function buildCustomToolDeclarations(options?: {
  includeDelegation?: boolean;
}): CustomFunctionDeclaration[] {
  if (!hasCustomToolsAvailable()) {
    return [];
  }

  const includeDelegation = options?.includeDelegation ?? false;

  return [...TOOL_REGISTRY.values()]
    .filter((tool) => {
      const name = tool.declaration.name;
      if (name === DELEGATE_BACKGROUND_TASK_TOOL) {
        return includeDelegation;
      }
      // Gemini Interactions API rejects too many function declarations at once.
      // When delegation is active, drop low-priority tools to make room for delegateBackgroundTask.
      if (includeDelegation && (name === GET_WEATHER_TOOL || name === RANDOM_CHOICE_TOOL)) {
        return false;
      }
      return true;
    })
    .map((tool) => tool.declaration);
}

export async function executeCustomTool(
  name: string,
  args: Record<string, unknown>,
  ctx: CustomToolContext,
): Promise<unknown> {
  const tool = TOOL_REGISTRY.get(name);
  if (!tool) {
    throw new Error(`Unknown custom tool: ${name}`);
  }

  return tool.handler(args, ctx);
}
