import type { TranscriptionTimings } from '@/lib/gemini/config';

export interface TranscriptionStreamDone {
  transcript: string;
  timings: TranscriptionTimings;
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join('\n') };
}

export async function consumeTranscriptionStream(
  response: Response,
  onDelta?: (text: string) => void,
): Promise<{ done: TranscriptionStreamDone | null; error: string | null }> {
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { error?: string };
      return { done: null, error: payload.error ?? 'Transcription request failed.' };
    }

    return { done: null, error: 'Transcription request failed.' };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { done: null, error: 'Streaming response body is unavailable.' };
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const parsed = parseSseBlock(block);
      if (parsed) {
        try {
          const payload = JSON.parse(parsed.data) as Record<string, unknown>;

          if (parsed.event === 'delta' && typeof payload.text === 'string') {
            onDelta?.(payload.text);
          } else if (parsed.event === 'done') {
            const transcript = typeof payload.transcript === 'string' ? payload.transcript : '';
            const timings = payload.timings as TranscriptionTimings | undefined;

            if (!transcript || !timings) {
              return { done: null, error: 'Streaming transcription completed without a transcript.' };
            }

            return { done: { transcript, timings }, error: null };
          } else if (parsed.event === 'error') {
            return {
              done: null,
              error: typeof payload.message === 'string' ? payload.message : 'Transcription failed.',
            };
          }
        } catch {
          return { done: null, error: 'Failed to parse streaming transcription response.' };
        }
      }

      boundary = buffer.indexOf('\n\n');
    }
  }

  return { done: null, error: 'Streaming transcription ended before completion.' };
}
