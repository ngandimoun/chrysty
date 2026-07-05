import { GoogleGenAI } from '@google/genai';

import {
  getGeminiApiKey,
  getGeminiTtsFallbackModel,
  getGeminiTtsFallbackVoice,
  getGeminiTtsModel,
  getGeminiTtsVoice,
} from '@/lib/gemini/config';

export interface TtsAudioChunk {
  data: string;
  mime_type?: string;
  sample_rate?: number;
}

export type TtsStreamEvent =
  | { type: 'audio'; chunk: TtsAudioChunk }
  | { type: 'done'; ttsMs: number; ttsFirstAudioMs: number | null }
  | { type: 'error'; message: string };

function isRetryableTtsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('500') || message.includes('internal') || message.includes('text token');
}

function getErrorMessage(error: unknown, fallback = 'TTS generation failed.'): string {
  return error instanceof Error ? error.message : fallback;
}

async function* streamTtsOnce(
  client: GoogleGenAI,
  model: string,
  voice: string,
  ttsPrompt: string,
): AsyncGenerator<TtsStreamEvent> {
  const ttsStartedAt = performance.now();
  let ttsFirstAudioMs: number | null = null;

  const stream = await client.interactions.create({
    model,
    store: false,
    stream: true,
    input: ttsPrompt,
    response_format: { type: 'audio' },
    generation_config: {
      speech_config: [{ voice }],
    },
  });

  for await (const event of stream) {
    if (event.event_type === 'step.delta' && event.delta.type === 'audio' && event.delta.data) {
      if (ttsFirstAudioMs === null) {
        ttsFirstAudioMs = performance.now() - ttsStartedAt;
      }

      yield {
        type: 'audio',
        chunk: {
          data: event.delta.data,
          mime_type: event.delta.mime_type,
          sample_rate: event.delta.sample_rate ?? 24000,
        },
      };
    } else if (event.event_type === 'error') {
      const message =
        'error' in event && event.error && typeof event.error === 'object' && 'message' in event.error
          ? String(event.error.message)
          : 'Gemini TTS streaming failed.';
      yield { type: 'error', message };
      return;
    }
  }

  yield {
    type: 'done',
    ttsMs: performance.now() - ttsStartedAt,
    ttsFirstAudioMs,
  };
}

export interface SpeakOnceResult {
  pcmBase64: string;
  mime_type?: string;
  sample_rate: number;
  ttsMs: number;
}

async function speakOnceWithClient(
  client: GoogleGenAI,
  model: string,
  voice: string,
  ttsPrompt: string,
): Promise<SpeakOnceResult> {
  const ttsStartedAt = performance.now();

  const interaction = await client.interactions.create({
    model,
    store: false,
    input: ttsPrompt,
    response_format: { type: 'audio' },
    generation_config: {
      speech_config: [{ voice }],
    },
  });

  const outputAudio = interaction.output_audio;
  if (!outputAudio?.data) {
    throw new Error('Gemini TTS returned no audio.');
  }

  return {
    pcmBase64: outputAudio.data,
    mime_type: outputAudio.mime_type,
    sample_rate: outputAudio.sample_rate ?? 24000,
    ttsMs: performance.now() - ttsStartedAt,
  };
}

type TtsAttemptOutcome =
  | { ok: true; ttsMs: number; ttsFirstAudioMs: number | null; emittedAudio: boolean }
  | { ok: false; message: string; retryable: boolean; emittedAudio: boolean };

async function* runStreamAttempt(
  client: GoogleGenAI,
  model: string,
  voice: string,
  ttsPrompt: string,
): AsyncGenerator<TtsStreamEvent, TtsAttemptOutcome> {
  let emittedAudio = false;

  try {
    for await (const event of streamTtsOnce(client, model, voice, ttsPrompt)) {
      if (event.type === 'audio') {
        emittedAudio = true;
        yield event;
      } else if (event.type === 'done') {
        return {
          ok: true,
          ttsMs: event.ttsMs,
          ttsFirstAudioMs: event.ttsFirstAudioMs,
          emittedAudio,
        };
      } else {
        return {
          ok: false,
          message: event.message,
          retryable: isRetryableTtsError(event.message),
          emittedAudio,
        };
      }
    }
  } catch (error) {
    return {
      ok: false,
      message: getErrorMessage(error),
      retryable: isRetryableTtsError(error),
      emittedAudio,
    };
  }

  return {
    ok: false,
    message: 'Gemini TTS streaming ended without completion.',
    retryable: true,
    emittedAudio,
  };
}

function buildTtsCandidates(): Array<{ model: string; voice: string }> {
  const primary = { model: getGeminiTtsModel(), voice: getGeminiTtsVoice() };
  const fallback = { model: getGeminiTtsFallbackModel(), voice: getGeminiTtsFallbackVoice() };
  const seen = new Set<string>();

  return [primary, fallback].filter((candidate) => {
    const key = `${candidate.model}\n${candidate.voice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function* consumeStreamAttempt(
  client: GoogleGenAI,
  model: string,
  voice: string,
  ttsPrompt: string,
): AsyncGenerator<TtsStreamEvent, TtsAttemptOutcome> {
  const iterator = runStreamAttempt(client, model, voice, ttsPrompt);

  while (true) {
    const next = await iterator.next();
    if (next.done) {
      return next.value;
    }

    yield next.value;
  }
}

export async function speakOnce(
  ttsPrompt: string,
  options?: { client?: GoogleGenAI },
): Promise<SpeakOnceResult> {
  const model = getGeminiTtsModel();
  const voice = getGeminiTtsVoice();
  const client = options?.client ?? new GoogleGenAI({ apiKey: getGeminiApiKey() });

  try {
    return await speakOnceWithClient(client, model, voice, ttsPrompt);
  } catch (error) {
    if (!isRetryableTtsError(error)) {
      throw error;
    }

    return await speakOnceWithClient(client, model, voice, ttsPrompt);
  }
}

export async function speakOnceResilient(
  ttsPrompt: string,
  options?: { client?: GoogleGenAI },
): Promise<SpeakOnceResult> {
  const client = options?.client ?? new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const candidates = buildTtsCandidates();
  let lastError = 'TTS generation failed.';

  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await speakOnceWithClient(client, candidate.model, candidate.voice, ttsPrompt);
      } catch (error) {
        lastError = getErrorMessage(error);
        if (!isRetryableTtsError(error) || attempt === 1) {
          break;
        }
      }
    }
  }

  throw new Error(lastError);
}

export async function* speakStream(
  ttsPrompt: string,
  options?: { client?: GoogleGenAI },
): AsyncGenerator<TtsStreamEvent> {
  const model = getGeminiTtsModel();
  const voice = getGeminiTtsVoice();
  const client = options?.client ?? new GoogleGenAI({ apiKey: getGeminiApiKey() });

  try {
    yield* streamTtsOnce(client, model, voice, ttsPrompt);
  } catch (error) {
    if (!isRetryableTtsError(error)) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'TTS generation failed.',
      };
      return;
    }

    try {
      yield* streamTtsOnce(client, model, voice, ttsPrompt);
    } catch (retryError) {
      yield {
        type: 'error',
        message: retryError instanceof Error ? retryError.message : 'TTS generation failed after retry.',
      };
    }
  }
}

export async function* speakStreamResilient(
  ttsPrompt: string,
  options?: { client?: GoogleGenAI },
): AsyncGenerator<TtsStreamEvent> {
  const client = options?.client ?? new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const candidates = buildTtsCandidates();
  const startedAt = performance.now();
  let ttsFirstAudioMs: number | null = null;
  let lastError = 'TTS generation failed.';

  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let shouldRetryCandidate = false;
      const iterator = consumeStreamAttempt(client, candidate.model, candidate.voice, ttsPrompt);

      while (true) {
        const next = await iterator.next();
        if (next.done) {
          const outcome = next.value;
          if (outcome.ok) {
            yield {
              type: 'done',
              ttsMs: performance.now() - startedAt,
              ttsFirstAudioMs,
            };
            return;
          }

          lastError = outcome.message;
          shouldRetryCandidate = outcome.retryable && attempt === 0;
          if (outcome.emittedAudio) {
            yield { type: 'error', message: outcome.message };
            return;
          }

          break;
        }

        if (next.value.type === 'audio' && ttsFirstAudioMs === null) {
          ttsFirstAudioMs = performance.now() - startedAt;
        }
        yield next.value;
      }

      if (!shouldRetryCandidate) {
        break;
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const result = await speakOnceWithClient(client, candidate.model, candidate.voice, ttsPrompt);
      if (ttsFirstAudioMs === null) {
        ttsFirstAudioMs = performance.now() - startedAt;
      }

      yield {
        type: 'audio',
        chunk: {
          data: result.pcmBase64,
          ...(result.mime_type ? { mime_type: result.mime_type } : {}),
          sample_rate: result.sample_rate,
        },
      };
      yield {
        type: 'done',
        ttsMs: performance.now() - startedAt,
        ttsFirstAudioMs,
      };
      return;
    } catch (error) {
      lastError = getErrorMessage(error);
    }
  }

  yield { type: 'error', message: lastError };
}
