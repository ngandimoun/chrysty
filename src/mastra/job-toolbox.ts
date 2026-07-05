import { createTool, type ToolAction } from '@mastra/core/tools';
import { z } from 'zod';

import { addGeneratedDocument, listGeneratedDocuments, listReferenceDocuments } from '@/lib/astra/db/documents';
import { appendJobLog, getBackgroundJob, updateBackgroundJob } from '@/lib/background-jobs/db';
import { MAX_CHART_ROWS } from '@/lib/charts/types';
import type {
  GeneratedChartPayload,
  GeneratedTextPayload,
} from '@/lib/documents/generated-document-types';
import { truncateTitle } from '@/lib/documents/generated-document-types';
import { getOpenWeatherApiKey } from '@/lib/gemini/config';
import { evaluateExpression } from '@/lib/gemini/tools/calculator';
import { fetchCurrentWeather } from '@/lib/gemini/weather';
import {
  callFormulaFiber,
  getBackgroundFormulaUris,
  loadFormulaToolDefinitions,
} from '@/lib/kimi/formula';
import { buildPexelsStockImageGroups } from '@/lib/pexels/photos';
import type { StockImageGroup, VisualImageGroupRequest } from '@/lib/visuals/stock-images';

import { formulaParametersToZod } from './json-schema-to-zod';

export interface JobScope {
  jobId: string;
  workspaceId: string;
  astraKey: string;
  userId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JobTool = ToolAction<any, any, any, any>;

export type JobToolbox = Record<string, JobTool>;

function sanitizeToolKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

async function buildFormulaTools(): Promise<JobToolbox> {
  const definitions = await loadFormulaToolDefinitions(getBackgroundFormulaUris());
  const tools: JobToolbox = {};

  for (const definition of definitions) {
    const key = sanitizeToolKey(definition.name);
    if (tools[key]) continue;

    tools[key] = createTool({
      id: key,
      description: definition.description || `Moonshot official tool ${definition.name}`,
      inputSchema: formulaParametersToZod(definition.parameters),
      execute: async (inputData) => {
        const output = await callFormulaFiber(
          definition.uri,
          definition.name,
          (inputData ?? {}) as Record<string, unknown>,
        );
        return output.length > 24_000 ? `${output.slice(0, 24_000)}\n…[truncated]` : output;
      },
    });
  }

  return tools;
}

const chartSeriesSchema = z.object({
  key: z.string().describe('Data row key this series reads from'),
  label: z.string().describe('Human label for the series'),
  color: z.string().optional().describe('Optional hex color'),
});

const chartSpecSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  kind: z.enum(['bar', 'line', 'pie', 'area']),
  xKey: z.string().optional().describe('Row key for the x axis (bar/line/area)'),
  nameKey: z.string().optional().describe('Row key for slice names (pie)'),
  valueKey: z.string().optional().describe('Row key for slice values (pie)'),
  series: z.array(chartSeriesSchema).min(1),
  data: z
    .array(z.record(z.string(), z.union([z.string(), z.number()])))
    .min(1)
    .max(MAX_CHART_ROWS),
});

const imageSearchSchema = z.object({
  title: z.string().describe('Short caption for this photo group'),
  queries: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe('Concrete Pexels photo search queries, e.g. "Kyoto bamboo forest path"'),
});

function createDocumentTool(scope: JobScope): JobTool {
  return createTool({
    id: 'createDocument',
    description:
      'Saves a finished artifact into the user\'s Chrysty workspace so they can open it later. ' +
      'Use kind "text" for reports, guides, tables, plans, flashcards, code walkthroughs — any rich markdown document. ' +
      'Use kind "chart" for a standalone Recharts data visualization. ' +
      'Call this once per finished artifact; each call creates one document in the workspace.',
    inputSchema: z.object({
      title: z.string().describe('Clear document title shown in the workspace'),
      kind: z.enum(['text', 'chart']).describe('"text" = markdown document, "chart" = data chart'),
      markdown: z
        .string()
        .optional()
        .describe(
          'Full document body for kind "text". GitHub-flavored markdown: headings, tables, task lists, ' +
            'code fences, inline math $x^2$, block math $$...$$, chemistry \\ce{H2O}.',
        ),
      chart: chartSpecSchema.optional().describe('Chart spec for kind "chart"'),
      imageSearches: z
        .array(imageSearchSchema)
        .max(3)
        .optional()
        .describe(
          'Optional real-world reference photo groups (resolved via Pexels) embedded in a text document. ' +
            'Only for concrete visible things: places, ingredients, tools, products.',
        ),
    }),
    outputSchema: z.object({
      documentId: z.string(),
      title: z.string(),
    }),
    execute: async (inputData) => {
      const { title, kind, markdown, chart, imageSearches } = inputData as {
        title: string;
        kind: 'text' | 'chart';
        markdown?: string;
        chart?: z.infer<typeof chartSpecSchema>;
        imageSearches?: Array<z.infer<typeof imageSearchSchema>>;
      };

      let jsonPayload: string;
      let docKind: string;

      if (kind === 'chart') {
        if (!chart) throw new Error('kind "chart" requires the chart field.');
        const payload: GeneratedChartPayload = {
          chart: {
            id: `job-chart-${Date.now().toString(36)}`,
            ...chart,
            series: chart.series,
            data: chart.data,
          },
        };
        jsonPayload = JSON.stringify(payload);
        docKind = 'chart';
      } else {
        if (!markdown?.trim()) throw new Error('kind "text" requires the markdown field.');

        let stockImages: StockImageGroup[] = [];
        if (imageSearches?.length && process.env.PEXELS_API_KEY?.trim()) {
          const requests: VisualImageGroupRequest[] = imageSearches.map((group, index) => ({
            id: `job-visual-${index + 1}`,
            title: group.title,
            intent: 'example',
            layout: group.queries.length > 1 ? 'grid' : 'single',
            queries: group.queries.slice(0, 4),
          }));
          try {
            stockImages = await buildPexelsStockImageGroups(requests);
          } catch (error) {
            console.warn('[background-jobs] Pexels resolution failed:', error);
          }
        }

        const payload: GeneratedTextPayload = {
          fullText: markdown.trim(),
          ...(stockImages.length > 0 ? { stockImages } : {}),
        };
        jsonPayload = JSON.stringify(payload);
        docKind = 'text';
      }

      const created = await addGeneratedDocument({
        workspaceId: scope.workspaceId,
        astraKey: scope.astraKey,
        userId: scope.userId,
        kind: docKind,
        title: truncateTitle(title, 80),
        jsonPayload,
        jobId: scope.jobId,
      });

      return { documentId: created.id, title: created.title };
    },
  });
}

function reportProgressTool(scope: JobScope): JobTool {
  return createTool({
    id: 'reportProgress',
    description:
      'Reports what you are currently doing so the user can follow along live. ' +
      'Call with a short present-tense activity like "Comparing pricing across 12 suppliers".',
    inputSchema: z.object({
      activity: z.string().describe('Short present-tense status line for the user'),
    }),
    execute: async (inputData) => {
      const { activity } = inputData as { activity: string };
      try {
        const job = await getBackgroundJob(scope.jobId);
        if (job) {
          const progress = appendJobLog({ ...job.progress, activity }, activity);
          await updateBackgroundJob(scope.jobId, {
            progress,
            heartbeat_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn('[background-jobs] reportProgress failed:', error);
      }
      return { ok: true };
    },
  });
}

function listWorkspaceDocumentsTool(scope: JobScope): JobTool {
  return createTool({
    id: 'listWorkspaceDocuments',
    description:
      "Lists the user's existing Chrysty documents (previously generated artifacts and uploaded reference files) with ids, titles, and kinds. Use to build on earlier work.",
    inputSchema: z.object({}),
    execute: async () => {
      const [generated, references] = await Promise.all([
        listGeneratedDocuments(scope.astraKey),
        listReferenceDocuments(scope.astraKey).catch(() => []),
      ]);

      return {
        generatedDocuments: generated.slice(0, 40).map((doc) => ({
          id: doc.id,
          title: doc.title,
          kind: doc.kind,
          createdAt: doc.created_at,
        })),
        uploadedReferences: references.map((doc) => ({
          name: doc.name,
          kind: doc.kind,
        })),
      };
    },
  });
}

function readWorkspaceDocumentTool(scope: JobScope): JobTool {
  return createTool({
    id: 'readWorkspaceDocument',
    description:
      'Reads the content of a previously generated Chrysty document by id (text and chart documents). Use listWorkspaceDocuments first to find ids.',
    inputSchema: z.object({
      documentId: z.string(),
    }),
    execute: async (inputData) => {
      const { documentId } = inputData as { documentId: string };
      const documents = await listGeneratedDocuments(scope.astraKey);
      const document = documents.find((doc) => doc.id === documentId);
      if (!document) throw new Error(`Document ${documentId} not found.`);
      if (!document.json_payload) {
        return { title: document.title, kind: document.kind, content: '[binary document — no readable text]' };
      }
      const content =
        document.json_payload.length > 20_000
          ? `${document.json_payload.slice(0, 20_000)}\n…[truncated]`
          : document.json_payload;
      return { title: document.title, kind: document.kind, content };
    },
  });
}

function calculatorTool(): JobTool {
  return createTool({
    id: 'calculator',
    description: 'Evaluates a safe arithmetic expression, e.g. "280 * 0.15" or "sqrt(144)".',
    inputSchema: z.object({
      expression: z.string(),
    }),
    execute: async (inputData) => {
      const { expression } = inputData as { expression: string };
      return evaluateExpression(expression);
    },
  });
}

function weatherTool(): JobTool {
  return createTool({
    id: 'getWeather',
    description: 'Returns current weather for a location name or coordinates.',
    inputSchema: z.object({
      location: z.string().optional().describe('City and region, e.g. Lisbon, Portugal'),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }),
    execute: async (inputData) => {
      const { location, latitude, longitude } = inputData as {
        location?: string;
        latitude?: number;
        longitude?: number;
      };
      return fetchCurrentWeather({ location, latitude, longitude });
    },
  });
}

/**
 * Builds the full toolbox for a background job: Moonshot official formula tools
 * plus Chrysty workspace tools (documents, progress, calculator, weather).
 */
export async function buildJobToolbox(scope: JobScope): Promise<JobToolbox> {
  const formulaTools = await buildFormulaTools();

  const localTools: JobToolbox = {
    createDocument: createDocumentTool(scope),
    reportProgress: reportProgressTool(scope),
    listWorkspaceDocuments: listWorkspaceDocumentsTool(scope),
    readWorkspaceDocument: readWorkspaceDocumentTool(scope),
    calculator: calculatorTool(),
    ...(getOpenWeatherApiKey() ? { getWeather: weatherTool() } : {}),
  };

  // Local tools win on name collisions with formula tools.
  return { ...formulaTools, ...localTools };
}
