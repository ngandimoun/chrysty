import { createTool, type ToolAction } from '@mastra/core/tools';
import { z } from 'zod';

import {
  addGeneratedDocument,
  GeneratedDocumentConflictError,
  getGeneratedDocumentBySourceKey,
  listGeneratedDocuments,
  listReferenceDocuments,
  mutateGeneratedDocument,
} from '@/lib/astra/db/documents';
import { appendJobLog, getBackgroundJob, updateBackgroundJob } from '@/lib/background-jobs/db';
import { MAX_CHART_ROWS } from '@/lib/charts/types';
import type {
  GeneratedChartPayload,
  GeneratedTextPayload,
} from '@/lib/documents/generated-document-types';
import { truncateTitle } from '@/lib/documents/generated-document-types';
import { buildUpdatedTextPayload, getDocumentFullText } from '@/lib/documents/document-content';
import {
  buildLivingDocumentSource,
  livingDocumentSourceKey,
  objectiveRequestsMultipleDeliverables,
  resolveLivingDeliverableKey,
  upsertLivingDocumentSection,
} from '@/lib/documents/living-document';
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
  objective: string;
  jobTitle: string;
  artifactLanguage: string;
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
      'Updates this objective\'s primary living document so the user can open the latest result later. ' +
      'Use kind "text" for reports, guides, tables, plans, flashcards, code walkthroughs — any rich markdown document. ' +
      'Each call idempotently replaces or appends a clearly named section; retries do not create duplicate sections. ' +
      'Separate documents, including standalone charts, are allowed only when the user objective explicitly requests multiple deliverables.',
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
      sectionName: z
        .string()
        .optional()
        .describe('Stable, clearly named section to update in the living document; reuse it on retries.'),
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
      revision: z.number(),
    }),
    execute: async (inputData) => {
      const { title, kind, markdown, chart, imageSearches, sectionName } = inputData as {
        title: string;
        kind: 'text' | 'chart';
        markdown?: string;
        chart?: z.infer<typeof chartSpecSchema>;
        imageSearches?: Array<z.infer<typeof imageSearchSchema>>;
        sectionName?: string;
      };

      let jsonPayload: string;
      let docKind: string;
      const explicitMultiple = objectiveRequestsMultipleDeliverables(scope.objective);
      const deliverableKey = resolveLivingDeliverableKey({
        objective: scope.objective,
        title,
        kind,
      });
      const sourceKey = livingDocumentSourceKey(scope.jobId, deliverableKey);
      const sourceMetadata = buildLivingDocumentSource(
        scope.jobId,
        deliverableKey,
        explicitMultiple,
      );

      if (kind === 'chart') {
        if (!explicitMultiple) {
          throw new Error(
            'This objective has one living document. Add the numeric findings as a markdown table or section instead of a standalone chart.',
          );
        }
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

        const sectionKey = explicitMultiple ? 'document' : sectionName?.trim() || title;
        let existing = await getGeneratedDocumentBySourceKey(scope.astraKey, sourceKey);
        for (let attempt = 0; attempt < 3; attempt++) {
          if (!existing) {
            const fullText = upsertLivingDocumentSection({
              currentMarkdown: '',
              sectionKey,
              sectionTitle: sectionName?.trim() || title,
              markdown: markdown.trim(),
            });
            try {
              const created = await addGeneratedDocument({
                workspaceId: scope.workspaceId,
                astraKey: scope.astraKey,
                userId: scope.userId,
                kind: 'text',
                title: truncateTitle(explicitMultiple ? title : scope.jobTitle, 80),
                jsonPayload: JSON.stringify({
                  fullText,
                  ...(stockImages.length > 0 ? { stockImages } : {}),
                } satisfies GeneratedTextPayload),
                jobId: scope.jobId,
                sourceKey,
                sourceMetadata,
                auditMetadata: { created_by: 'background_objective', section_keys: [sectionKey] },
                artifactLanguage: scope.artifactLanguage,
              });
              return { documentId: created.id, title: created.title, revision: created.revision };
            } catch (error) {
              existing = await getGeneratedDocumentBySourceKey(scope.astraKey, sourceKey);
              if (!existing || attempt === 2) throw error;
              continue;
            }
          }

          if (existing.kind !== 'text') {
            throw new Error('The living deliverable already exists with a non-text kind.');
          }
          const record = {
            id: existing.id,
            kind: 'text' as const,
            title: existing.title,
            createdAt: new Date(existing.created_at).getTime(),
            updatedAt: new Date(existing.updated_at).getTime(),
            jsonPayload: existing.json_payload ?? undefined,
            revision: existing.revision,
          };
          const fullText = upsertLivingDocumentSection({
            currentMarkdown: getDocumentFullText(record),
            sectionKey,
            sectionTitle: sectionName?.trim() || title,
            markdown: markdown.trim(),
          });
          const payload = JSON.parse(
            buildUpdatedTextPayload(record.jsonPayload, fullText),
          ) as GeneratedTextPayload;
          if (stockImages.length > 0) payload.stockImages = stockImages;

          try {
            const updated = await mutateGeneratedDocument({
              astraKey: scope.astraKey,
              documentId: existing.id,
              expectedRevision: existing.revision,
              action: 'update',
              title: truncateTitle(explicitMultiple ? title : scope.jobTitle, 80),
              jsonPayload: JSON.stringify(payload),
              userId: scope.userId,
              sessionId: `background-job:${scope.jobId}`,
              metadata: {
                source: 'background_objective',
                job_id: scope.jobId,
                deliverable_key: deliverableKey,
                section_key: sectionKey,
              },
            });
            return { documentId: updated.id, title: updated.title, revision: updated.revision };
          } catch (error) {
            if (!(error instanceof GeneratedDocumentConflictError) || attempt === 2) throw error;
            existing = await getGeneratedDocumentBySourceKey(scope.astraKey, sourceKey);
          }
        }
        throw new Error('Could not update living document after concurrent changes.');
      }

      const existing = await getGeneratedDocumentBySourceKey(scope.astraKey, sourceKey);
      if (existing) {
        const updated = await mutateGeneratedDocument({
          astraKey: scope.astraKey,
          documentId: existing.id,
          expectedRevision: existing.revision,
          action: 'update',
          title: truncateTitle(title, 80),
          jsonPayload,
          userId: scope.userId,
          sessionId: `background-job:${scope.jobId}`,
          metadata: { source: 'background_objective', deliverable_key: deliverableKey },
        });
        return { documentId: updated.id, title: updated.title, revision: updated.revision };
      }
      const created = await addGeneratedDocument({
        workspaceId: scope.workspaceId,
        astraKey: scope.astraKey,
        userId: scope.userId,
        kind: docKind,
        title: truncateTitle(title, 80),
        jsonPayload,
        jobId: scope.jobId,
        sourceKey,
        sourceMetadata,
        auditMetadata: { created_by: 'background_objective' },
        artifactLanguage: scope.artifactLanguage,
      });
      return { documentId: created.id, title: created.title, revision: created.revision };
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
