import { GoogleGenAI } from '@google/genai';

import {
  assertSupportedAudioMimeType,
  getGeminiApiKey,
  getGeminiSttModel,
  isGeminiAcceptedMimeType,
  normalizeAudioMimeType,
  type TranscriptionResult,
  type TranscriptionTimings,
} from '@/lib/gemini/config';
import {
  isInteractionAudioMimeFailure,
  sanitizeInteractionAudio,
  uploadSanitizedAudioForGemini,
} from '@/lib/gemini/sanitize-audio';

const TRANSCRIBE_PROMPT =
  'Transcribe the speech verbatim. Output only the transcript text, with no preamble or labels.';

const MAX_INLINE_BYTES = 20 * 1024 * 1024;

export type TranscriptionStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; transcript: string; timings: TranscriptionTimings }
  | { type: 'error'; message: string };

function isInlineMimeFailure(error: unknown): boolean {
  return isInteractionAudioMimeFailure(error);
}

type AudioInput =
  | { kind: 'inline'; base64Audio: string; mimeType: string }
  | { kind: 'uri'; uri: string; mimeType: string };

function buildAudioInput(input: AudioInput) {
  if (input.kind === 'inline') {
    return { type: 'audio' as const, data: input.base64Audio, mime_type: input.mimeType };
  }

  return { type: 'audio' as const, uri: input.uri, mime_type: input.mimeType };
}

async function* streamTranscription(
  client: GoogleGenAI,
  model: string,
  audioInput: AudioInput,
  timingsBase: Pick<TranscriptionTimings, 'audioDurationMs' | 'encodeMs'>,
): AsyncGenerator<TranscriptionStreamEvent> {
  const apiStartedAt = performance.now();
  let transcript = '';
  let apiTimeToFirstTokenMs: number | null = null;

  const stream = await client.interactions.create({
    model,
    store: false,
    stream: true,
    input: [{ type: 'text', text: TRANSCRIBE_PROMPT }, buildAudioInput(audioInput)],
  });

  for await (const event of stream) {
    if (event.event_type === 'step.delta' && event.delta.type === 'text') {
      if (apiTimeToFirstTokenMs === null) {
        apiTimeToFirstTokenMs = performance.now() - apiStartedAt;
      }

      transcript += event.delta.text;
      yield { type: 'delta', text: event.delta.text };
    } else if (event.event_type === 'error') {
      const message =
        'error' in event && event.error && typeof event.error === 'object' && 'message' in event.error
          ? String(event.error.message)
          : 'Gemini streaming transcription failed.';
      yield { type: 'error', message };
      return;
    }
  }

  const trimmed = transcript.trim();
  if (!trimmed) {
    yield { type: 'error', message: 'Gemini returned an empty transcript.' };
    return;
  }

  const apiMs = performance.now() - apiStartedAt;

  yield {
    type: 'done',
    transcript: trimmed,
    timings: {
      ...timingsBase,
      networkMs: 0,
      apiMs,
      totalMs: apiMs,
      apiTimeToFirstTokenMs,
    },
  };
}

async function transcribeWithInlineAudio(
  client: GoogleGenAI,
  model: string,
  base64Audio: string,
  mimeType: string,
): Promise<string> {
  const interaction = await client.interactions.create({
    model,
    store: false,
    input: [
      { type: 'text', text: TRANSCRIBE_PROMPT },
      { type: 'audio', data: base64Audio, mime_type: mimeType },
    ],
  });

  const transcript = interaction.output_text?.trim();
  if (!transcript) {
    throw new Error('Gemini returned an empty transcript.');
  }

  return transcript;
}

async function transcribeWithUploadedFile(
  client: GoogleGenAI,
  model: string,
  audioBytes: Buffer,
  mimeType: string,
): Promise<string> {
  const uploaded = await uploadSanitizedAudioForGemini(client, audioBytes, mimeType);

  const interaction = await client.interactions.create({
    model,
    store: false,
    input: [
      { type: 'text', text: TRANSCRIBE_PROMPT },
      {
        type: 'audio',
        uri: uploaded.uri,
        mime_type: uploaded.mimeType,
      },
    ],
  });

  const transcript = interaction.output_text?.trim();
  if (!transcript) {
    throw new Error('Gemini returned an empty transcript.');
  }

  return transcript;
}

async function uploadAudioForGemini(
  client: GoogleGenAI,
  audioBytes: Buffer,
  mimeType: string,
): Promise<{ uri: string; mimeType: string }> {
  return uploadSanitizedAudioForGemini(client, audioBytes, mimeType);
}

export async function* transcribeAudioStream(
  audioBytes: Buffer,
  mimeType: string,
  audioDurationMs: number,
): AsyncGenerator<TranscriptionStreamEvent> {
  if (audioBytes.byteLength > MAX_INLINE_BYTES) {
    yield { type: 'error', message: 'Audio file exceeds the 20 MB inline upload limit.' };
    return;
  }

  const normalizedMimeType = normalizeAudioMimeType(mimeType);

  try {
    assertSupportedAudioMimeType(normalizedMimeType);
  } catch (error) {
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unsupported audio format.',
    };
    return;
  }

  const { bytes: preparedAudioBytes, mimeType: interactionMimeType } = sanitizeInteractionAudio(
    audioBytes,
    normalizedMimeType,
  );

  const apiKey = getGeminiApiKey();
  const model = getGeminiSttModel();
  const client = new GoogleGenAI({ apiKey });

  const encodeStartedAt = performance.now();
  const base64Audio = preparedAudioBytes.toString('base64');
  const encodeMs = performance.now() - encodeStartedAt;

  const timingsBase = { audioDurationMs, encodeMs };

  try {
    yield* streamTranscription(client, model, {
      kind: 'inline',
      base64Audio,
      mimeType: interactionMimeType,
    }, timingsBase);
  } catch (error) {
    if (!isInlineMimeFailure(error) || !isGeminiAcceptedMimeType(interactionMimeType)) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Transcription failed.',
      };
      return;
    }

    try {
      const uploaded = await uploadAudioForGemini(client, preparedAudioBytes, interactionMimeType);
      yield* streamTranscription(
        client,
        model,
        { kind: 'uri', uri: uploaded.uri, mimeType: uploaded.mimeType },
        timingsBase,
      );
    } catch (uploadError) {
      yield {
        type: 'error',
        message: uploadError instanceof Error ? uploadError.message : 'Transcription failed.',
      };
    }
  }
}

export async function transcribeAudioToText(
  audioBytes: Buffer,
  mimeType: string,
  audioDurationMs: number,
): Promise<{ transcript: string; sttMs: number }> {
  let transcript = '';
  let sttMs = 0;

  for await (const event of transcribeAudioStream(audioBytes, mimeType, audioDurationMs)) {
    if (event.type === 'delta') {
      transcript += event.text;
    } else if (event.type === 'done') {
      transcript = event.transcript;
      sttMs = event.timings.apiMs;
    } else if (event.type === 'error') {
      throw new Error(event.message);
    }
  }

  if (!transcript.trim()) {
    throw new Error('Gemini returned an empty transcript.');
  }

  return { transcript: transcript.trim(), sttMs };
}

export async function transcribeAudio(
  audioBytes: Buffer,
  mimeType: string,
  audioDurationMs: number,
): Promise<TranscriptionResult> {
  if (audioBytes.byteLength > MAX_INLINE_BYTES) {
    throw new Error('Audio file exceeds the 20 MB inline upload limit.');
  }

  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  assertSupportedAudioMimeType(normalizedMimeType);

  const { bytes: preparedAudioBytes, mimeType: interactionMimeType } = sanitizeInteractionAudio(
    audioBytes,
    normalizedMimeType,
  );

  const apiKey = getGeminiApiKey();
  const model = getGeminiSttModel();
  const client = new GoogleGenAI({ apiKey });

  const encodeStartedAt = performance.now();
  const base64Audio = preparedAudioBytes.toString('base64');
  const encodeMs = performance.now() - encodeStartedAt;

  const apiStartedAt = performance.now();
  let transcript: string;

  try {
    transcript = await transcribeWithInlineAudio(client, model, base64Audio, interactionMimeType);
  } catch (error) {
    if (!isInlineMimeFailure(error) || !isGeminiAcceptedMimeType(interactionMimeType)) {
      throw error;
    }

    transcript = await transcribeWithUploadedFile(client, model, preparedAudioBytes, interactionMimeType);
  }

  const apiMs = performance.now() - apiStartedAt;

  return {
    transcript,
    timings: {
      audioDurationMs,
      encodeMs,
      networkMs: 0,
      apiMs,
      totalMs: apiMs,
    },
  };
}
