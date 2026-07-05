import { NextResponse } from 'next/server';

import { PlatformAccessError, requirePlatformAccessFromRequest } from '@/lib/chrysty/guard';
import { transcribeAudio } from '@/lib/gemini/transcribe';
import { formatUserFacingGeminiError } from '@/lib/gemini/user-facing-error';

export const runtime = 'nodejs';

const MAX_INLINE_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requirePlatformAccessFromRequest(request);
  } catch (error) {
    if (error instanceof PlatformAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  try {
    const formData = await request.formData();
    const audio = formData.get('audio');
    const mimeType = String(formData.get('mimeType') ?? '');
    const audioDurationMs = Number(formData.get('audioDurationMs') ?? 0);

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'Missing audio file.' }, { status: 400 });
    }

    if (audio.size === 0) {
      return NextResponse.json({ error: 'Audio file is empty.' }, { status: 400 });
    }

    if (audio.size > MAX_INLINE_BYTES) {
      return NextResponse.json({ error: 'Audio file exceeds the 20 MB limit.' }, { status: 413 });
    }

    const audioBytes = Buffer.from(await audio.arrayBuffer());
    const result = await transcribeAudio(
      audioBytes,
      mimeType || audio.type,
      Number.isFinite(audioDurationMs) ? audioDurationMs : 0,
    );

    return NextResponse.json(result);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Transcription failed.';
    const message = formatUserFacingGeminiError(rawMessage);
    const status = rawMessage.includes('GEMINI_API_KEY') ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
