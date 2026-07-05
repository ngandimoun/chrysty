import { PlatformAccessError, requirePlatformAccessFromRequest } from '@/lib/chrysty/guard';
import { transcribeAudioStream } from '@/lib/gemini/transcribe';
import { formatUserFacingGeminiError } from '@/lib/gemini/user-facing-error';

export const runtime = 'nodejs';

const MAX_INLINE_BYTES = 20 * 1024 * 1024;

function encodeSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  try {
    await requirePlatformAccessFromRequest(request);
  } catch (error) {
    if (error instanceof PlatformAccessError) {
      return new Response(encodeSseEvent('error', { message: error.message }), {
        status: error.status,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }
    throw error;
  }

  try {
    const formData = await request.formData();
    const audio = formData.get('audio');
    const mimeType = String(formData.get('mimeType') ?? '');
    const audioDurationMs = Number(formData.get('audioDurationMs') ?? 0);

    if (!(audio instanceof File)) {
      return new Response(encodeSseEvent('error', { message: 'Missing audio file.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    if (audio.size === 0) {
      return new Response(encodeSseEvent('error', { message: 'Audio file is empty.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    if (audio.size > MAX_INLINE_BYTES) {
      return new Response(encodeSseEvent('error', { message: 'Audio file exceeds the 20 MB limit.' }), {
        status: 413,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    const audioBytes = Buffer.from(await audio.arrayBuffer());
    const durationMs = Number.isFinite(audioDurationMs) ? audioDurationMs : 0;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const event of transcribeAudioStream(audioBytes, mimeType || audio.type, durationMs)) {
            if (event.type === 'delta') {
              controller.enqueue(encoder.encode(encodeSseEvent('delta', { text: event.text })));
            } else if (event.type === 'done') {
              controller.enqueue(
                encoder.encode(
                  encodeSseEvent('done', {
                    transcript: event.transcript,
                    timings: event.timings,
                  }),
                ),
              );
            } else if (event.type === 'error') {
              controller.enqueue(
                encoder.encode(
                  encodeSseEvent('error', { message: formatUserFacingGeminiError(event.message) }),
                ),
              );
            }
          }
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : 'Transcription failed.';
          const message = formatUserFacingGeminiError(rawMessage);
          controller.enqueue(encoder.encode(encodeSseEvent('error', { message })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Transcription failed.';
    const message = formatUserFacingGeminiError(rawMessage);
    return new Response(encodeSseEvent('error', { message }), {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }
}
