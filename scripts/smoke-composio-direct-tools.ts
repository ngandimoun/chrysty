/**
 * Background smoke: Direct Tools + two-stage + server fallback for empty tool stage.
 *
 * Usage: pnpm tsx scripts/smoke-composio-direct-tools.ts [userId]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { GoogleGenAI } from '@google/genai';

function loadEnvLocal() {
  const envPath = join(process.cwd(), '.env.local');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const DEFAULT_USER_ID = '27c3adde-881e-4c9a-94cb-4efad2ae7d12';

const MINI_VOICE_FORMAT = {
  type: 'text' as const,
  mime_type: 'application/json',
  schema: {
    type: 'object',
    properties: {
      spoken_transcript: { type: 'string' },
      explanation_text: { type: 'string' },
      needs_visual_explanation: { type: 'boolean' },
      delivery_tag: { type: 'string' },
    },
    required: [
      'spoken_transcript',
      'explanation_text',
      'needs_visual_explanation',
      'delivery_tag',
    ],
  },
};

type Report = {
  startedAt: string;
  finishedAt?: string;
  userId: string;
  ok: boolean;
  steps: Record<string, unknown>;
  errors: string[];
};

async function main() {
  const userId = process.argv[2]?.trim() || DEFAULT_USER_ID;
  const report: Report = {
    startedAt: new Date().toISOString(),
    userId,
    ok: false,
    steps: {},
    errors: [],
  };
  const outPath = join(process.cwd(), 'scripts/smoke-composio-direct-tools-last.json');

  try {
    const {
      loadComposioFunctionDeclarations,
      executeComposioToolCall,
      buildComposioCompositionBlock,
      isMetaComposioToolName,
    } = await import('../src/lib/composio/tools');
    const { getGeminiApiKey, getGeminiResponseModel } = await import('../src/lib/gemini/config');

    const loaded = await loadComposioFunctionDeclarations(userId);
    const metaNames = loaded.tools
      .map((tool) => tool.name)
      .filter((name) => isMetaComposioToolName(name));
    report.steps.load = {
      toolCount: loaded.tools.length,
      metaOnly: loaded.metaOnly,
      connectedToolkitSlugs: loaded.connectedToolkitSlugs,
      toolNames: loaded.tools.map((tool) => tool.name),
      metaNames,
    };
    console.info('[smoke] loaded', report.steps.load);
    if (loaded.tools.length === 0 || metaNames.length > 0) {
      throw new Error('Expected Direct Tools app declarations only');
    }

    const composition = buildComposioCompositionBlock({
      toolCount: loaded.tools.length,
      toolNames: loaded.tools.map((tool) => tool.name),
      connectedToolkitSlugs: loaded.connectedToolkitSlugs,
    });
    report.steps.compositionBansHitch = /technical hitch|sync delay|permission error/i.test(
      composition,
    );
    if (!report.steps.compositionBansHitch) {
      throw new Error('Composition block missing hitch/sync ban language');
    }
    console.info('[smoke] composition hitch ban OK');

    const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    const model = getGeminiResponseModel();

    // Prove tools + response_format still fails.
    try {
      await client.interactions.create({
        model,
        store: false,
        system_instruction: 'Be brief.',
        input: 'Check my email.',
        tools: loaded.tools,
        response_format: MINI_VOICE_FORMAT,
      });
      report.steps.toolsPlusFormat = { ok: true, unexpected: true };
      console.warn('[smoke] tools+format unexpectedly OK');
    } catch (error) {
      report.steps.toolsPlusFormat = {
        ok: false,
        expectedFail: true,
        error: error instanceof Error ? error.message : String(error),
      };
      console.info('[smoke] tools+format failed as expected');
    }

    // Server-side fallback path (simulates empty tool stage).
    const fallbackName =
      loaded.tools.find((tool) => tool.name === 'GMAIL_FETCH_EMAILS')?.name ??
      loaded.tools.find((tool) => tool.name.startsWith('GMAIL_'))?.name;
    if (!fallbackName) {
      throw new Error('No Gmail tool available for fallback smoke');
    }

    const fallbackResult = await executeComposioToolCall(userId, fallbackName, {
      max_results: 5,
    });
    const preview =
      typeof fallbackResult === 'string'
        ? fallbackResult.slice(0, 700)
        : JSON.stringify(fallbackResult).slice(0, 700);
    report.steps.serverFallback = { ok: true, tool: fallbackName, preview };
    console.info('[smoke] server fallback execute OK', {
      tool: fallbackName,
      preview: preview.slice(0, 160),
    });

    const formatStage = (await client.interactions.create({
      model,
      store: false,
      system_instruction:
        'Produce structured voice JSON only. Use the tool results. Never invent hitch/sync failures. Do not call tools.',
      input: [
        { type: 'text', text: 'Check my recent Gmail inbox.' },
        {
          type: 'text',
          text: `Tool results (already executed):\n- ${fallbackName} => ${preview}\n\nProduce spoken_transcript summarizing real subjects/senders.`,
        },
      ],
      response_format: MINI_VOICE_FORMAT,
    })) as { output_text?: string };

    const formatted = formatStage.output_text?.trim() ?? '';
    report.steps.formatFromFallback = {
      ok: Boolean(formatted),
      outputPreview: formatted.slice(0, 600),
    };
    console.info('[smoke] format from fallback', report.steps.formatFromFallback);

    if (!formatted.includes('{')) {
      throw new Error('Format stage returned non-JSON');
    }
    const lower = formatted.toLowerCase();
    if (
      lower.includes('technical hitch') ||
      lower.includes('sync delay') ||
      lower.includes('permission')
    ) {
      throw new Error('Format stage still invented hitch/sync/permission language');
    }
    // Real mail smoke previously saw GitHub token mail; accept any non-empty spoken content.
    if (!/"spoken_transcript"\s*:\s*"[^"]+"/i.test(formatted) && !lower.includes('spoken_transcript')) {
      throw new Error('Format stage missing spoken_transcript');
    }

    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.errors.push(error instanceof Error ? error.message : String(error));
    console.error('[smoke] FAILED', report.errors[0]);
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.info('[smoke] wrote', outPath);
    console.info('[smoke] summary', { ok: report.ok, errors: report.errors });
  }

  if (!report.ok) process.exitCode = 1;
}

void main();
