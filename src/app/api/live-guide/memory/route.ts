import { NextResponse } from 'next/server';

import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { getMem0MemoryUserId } from '@/lib/mem0/identity';
import { persistTurnToMem0 } from '@/lib/mem0/persist';

export const runtime = 'nodejs';

const MAX_FIELD_CHARS = 200;

function cleanField(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD_CHARS) : '';
}

/**
 * Persists compact Live Guide task state to long-term memory so a returning
 * user can resume a physical project mid-way in a later session.
 */
export async function POST(request: Request) {
  let memoryUserId: string;

  try {
    const identity = await requireAstraIdentity(request, { ensureWorkspace: false });
    memoryUserId = getMem0MemoryUserId(identity);
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    throw error;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const task = (body.task ?? {}) as Record<string, unknown>;
    const name = cleanField(task.name);
    const stage = cleanField(task.stage);
    const progress = cleanField(task.progress);
    const note = cleanField(body.note);

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Missing task name.' }, { status: 400 });
    }

    const stateParts = [
      stage ? `stage: ${stage}` : null,
      progress ? `progress: ${progress}` : null,
      note ? `note: ${note}` : null,
    ].filter(Boolean);

    await persistTurnToMem0(
      memoryUserId,
      `I was working on a physical task with live guidance: ${name}.`,
      `Live guide session paused on "${name}"${stateParts.length > 0 ? ` (${stateParts.join(', ')})` : ''}. Resume from this state when the user returns to this task.`,
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not save task state.' }, { status: 500 });
  }
}
