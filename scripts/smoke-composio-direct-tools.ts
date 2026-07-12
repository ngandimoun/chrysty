/**
 * Background smoke test: Composio DIRECT_TOOLS + Gemini Interactions attach.
 * Does not need localhost UI — uses .env.local keys + Supabase user connections.
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
    console.info('[smoke] gemini attach attempt', { model, toolCount: loaded.tools.length });

    let interaction: {
      id?: string;
      output_text?: string;
      outputs?: unknown[];
    };
    try {
      interaction = (await client.interactions.create({
        model,
        store: false,
        system_instruction:
          'You are Chrysty. Use connected Gmail/Calendar tools when asked. Be brief. Never mention Composio.',
        input:
          'Check my recent Gmail inbox briefly (subject + sender only for a few messages). If calendar tools help, skip calendar this turn.',
        tools: loaded.tools,
      })) as typeof interaction;
      report.steps.geminiAttach = {
        ok: true,
        interactionId: interaction.id ?? null,
        outputPreview: (interaction.output_text ?? '').slice(0, 400),
        outputCount: Array.isArray(interaction.outputs) ? interaction.outputs.length : 0,
      };
      console.info('[smoke] gemini attach OK', report.steps.geminiAttach);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.steps.geminiAttach = { ok: false, error: message };
      console.error('[smoke] gemini attach FAILED', message);
      throw new Error(`Gemini Interactions rejected Composio tools: ${message}`);
    }

    const gmailTool =
      loaded.tools.find((tool) => tool.name.toUpperCase().includes('FETCH_EMAILS')) ??
      loaded.tools.find((tool) => tool.name.toUpperCase().startsWith('GMAIL_')) ??
      null;

    if (gmailTool) {
      console.info('[smoke] executing', gmailTool.name);
      try {
        const result = await executeComposioToolCall(userId, gmailTool.name, {
          max_results: 3,
        });
        const serialized = typeof result === 'string' ? result : JSON.stringify(result);
        report.steps.execute = {
          ok: true,
          tool: gmailTool.name,
          preview: serialized.slice(0, 600),
        };
        console.info('[smoke] execute OK', report.steps.execute);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Attach succeeded; execute may still fail on arg schema — record but do not fail the smoke.
        report.steps.execute = { ok: false, tool: gmailTool.name, error: message };
        console.warn('[smoke] execute failed (attach still passed)', message);
      }
    } else {
      report.steps.execute = { skipped: true, reason: 'no GMAIL_* tool in capped set' };
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
