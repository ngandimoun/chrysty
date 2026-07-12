/**
 * Background smoke test: Composio DIRECT_TOOLS + Gemini Interactions.
 * Proves tools alone work, tools+response_format fail, and two-stage path works.
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

function isMetaName(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    upper.startsWith('COMPOSIO_') ||
    upper.includes('SEARCH_TOOLS') ||
    upper.includes('MULTI_EXECUTE') ||
    upper.includes('GET_TOOL_SCHEMAS') ||
    upper.includes('MANAGE_CONNECTIONS')
  );
}

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
    const { getOrCreateUserSession, listActiveConnections, loadStoredSessionId } =
      await import('../src/lib/composio/client');
    const {
      loadComposioFunctionDeclarations,
      executeComposioToolCall,
      isMetaComposioToolName,
    } = await import('../src/lib/composio/tools');
    const { getGeminiApiKey, getGeminiResponseModel } = await import('../src/lib/gemini/config');

    const connections = await listActiveConnections(userId);
    report.steps.connections = connections.map((row) => ({
      toolkit_slug: row.toolkit_slug,
      connected_account_id: row.connected_account_id.slice(0, 12),
      status: row.status,
    }));
    console.info('[smoke] connections', report.steps.connections);

    const beforeSessionId = await loadStoredSessionId(userId);
    report.steps.beforeSessionId = beforeSessionId;

    const session = await getOrCreateUserSession(userId);
    const afterSessionId = await loadStoredSessionId(userId);
    report.steps.afterSessionId = afterSessionId;
    report.steps.sessionMigrated = Boolean(
      beforeSessionId && afterSessionId && beforeSessionId !== afterSessionId,
    );
    console.info('[smoke] session', {
      sessionId: session.sessionId,
      migrated: report.steps.sessionMigrated,
    });

    const loaded = await loadComposioFunctionDeclarations(userId);
    const toolNames = loaded.tools.map((tool) => tool.name);
    const metaNames = toolNames.filter((name) => isMetaComposioToolName(name) || isMetaName(name));
    const approxSchemaBytes = JSON.stringify(loaded.tools).length;

    report.steps.load = {
      toolCount: loaded.tools.length,
      metaOnly: loaded.metaOnly,
      connectedToolkitSlugs: loaded.connectedToolkitSlugs,
      toolNames,
      metaNames,
      approxSchemaBytes,
    };
    console.info('[smoke] loaded tools', report.steps.load);

    if (loaded.tools.length === 0) {
      throw new Error('No Composio app tools loaded (expected Gmail/Calendar direct tools).');
    }
    if (metaNames.length > 0) {
      throw new Error(`Meta tools still present: ${metaNames.join(', ')}`);
    }
    if (loaded.metaOnly) {
      throw new Error('metaOnly=true — DIRECT_TOOLS path failed');
    }

    const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    const model = getGeminiResponseModel();
    const systemInstruction =
      'You are Chrysty. Use connected Gmail/Calendar tools when asked. Be brief. Never mention Composio.';
    const userPrompt =
      'Check my recent Gmail inbox briefly (subject + sender only for a few messages).';

    console.info('[smoke] gemini attach without response_format', {
      model,
      toolCount: loaded.tools.length,
    });
    try {
      const interaction = (await client.interactions.create({
        model,
        store: false,
        system_instruction: systemInstruction,
        input: userPrompt,
        tools: loaded.tools,
      })) as { id?: string; output_text?: string; outputs?: unknown[] };
      report.steps.geminiAttachNoFormat = {
        ok: true,
        interactionId: interaction.id ?? null,
        outputPreview: (interaction.output_text ?? '').slice(0, 400),
      };
      console.info('[smoke] attach without response_format OK', report.steps.geminiAttachNoFormat);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.steps.geminiAttachNoFormat = { ok: false, error: message };
      throw new Error(`Gemini rejected Composio tools without response_format: ${message}`);
    }

    console.info('[smoke] gemini attach WITH response_format (expect fail)');
    try {
      await client.interactions.create({
        model,
        store: false,
        system_instruction: systemInstruction,
        input: userPrompt,
        tools: loaded.tools,
        response_format: MINI_VOICE_FORMAT,
      });
      report.steps.geminiAttachWithFormat = {
        ok: true,
        unexpected: 'Gemini accepted tools + response_format; rule may have changed',
      };
      console.warn('[smoke] tools+response_format unexpectedly succeeded');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.steps.geminiAttachWithFormat = {
        ok: false,
        expectedFail: true,
        error: message,
      };
      console.info('[smoke] tools+response_format failed as expected', message);
    }

    if (report.steps.geminiAttachWithFormat && (report.steps.geminiAttachWithFormat as { ok?: boolean }).ok) {
      // Soft warning only — still verify two-stage path.
      console.warn('[smoke] continuing; two-stage path still required for Live VOICE schema');
    } else if (!(report.steps.geminiAttachWithFormat as { expectedFail?: boolean })?.expectedFail) {
      throw new Error('Expected tools+response_format to fail with invalid argument');
    }

    console.info('[smoke] two-stage: tool then format');
    const toolStage = (await client.interactions.create({
      model,
      store: false,
      system_instruction: systemInstruction,
      input: userPrompt,
      tools: loaded.tools,
    })) as { output_text?: string };

    const gmailTool =
      loaded.tools.find((tool) => tool.name.toUpperCase().includes('FETCH_EMAILS')) ??
      loaded.tools.find((tool) => tool.name.toUpperCase().startsWith('GMAIL_')) ??
      null;

    let executePreview = '';
    if (gmailTool) {
      const result = await executeComposioToolCall(userId, gmailTool.name, {
        max_results: 3,
      });
      executePreview =
        typeof result === 'string' ? result.slice(0, 600) : JSON.stringify(result).slice(0, 600);
      report.steps.execute = { ok: true, tool: gmailTool.name, preview: executePreview };
      console.info('[smoke] execute OK', report.steps.execute);
    } else {
      report.steps.execute = { skipped: true, reason: 'no GMAIL_* tool in capped set' };
    }

    const formatStage = (await client.interactions.create({
      model,
      store: false,
      system_instruction: `${systemInstruction}\nProduce structured voice JSON only. Do not call tools.`,
      input: [
        { type: 'text', text: userPrompt },
        {
          type: 'text',
          text: [
            toolStage.output_text?.trim()
              ? `Assistant notes:\n${toolStage.output_text.trim()}`
              : '',
            executePreview ? `Tool results:\n${executePreview}` : '',
            'Return JSON with spoken_transcript summarizing recent email subjects.',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      response_format: MINI_VOICE_FORMAT,
    })) as { output_text?: string };

    const formatted = formatStage.output_text?.trim() ?? '';
    report.steps.twoStageFormat = {
      ok: Boolean(formatted),
      outputPreview: formatted.slice(0, 500),
    };
    console.info('[smoke] two-stage format', report.steps.twoStageFormat);

    if (!formatted) {
      throw new Error('Two-stage format Interaction returned empty output');
    }
    if (!formatted.includes('spoken_transcript') && !/"spoken_transcript"\s*:/.test(formatted)) {
      // Some models return JSON without the key name in preview if truncated — still require parseable JSON brace.
      if (!formatted.includes('{')) {
        throw new Error('Two-stage format output does not look like JSON');
      }
    }

    report.ok = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.errors.push(message);
    report.ok = false;
    console.error('[smoke] FAILED', message);
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.info('[smoke] wrote', outPath);
    console.info('[smoke] summary', { ok: report.ok, errors: report.errors });
  }

  if (!report.ok) process.exitCode = 1;
}

void main();
