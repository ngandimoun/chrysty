'use client';

import { useCallback, useRef, useState } from 'react';

import { prepareAudioForGemini, recordingFilename } from '@/lib/audio/convert';
import { getRecorderMimeType } from '@/lib/audio/mime';
import { createAudioRecorder } from '@/lib/audio/record';
import type { TranscriptionTimings } from '@/lib/gemini/config';
import { createUuid } from '@/lib/ids';
import { consumeTranscriptionStream } from '@/lib/streaming/consume-transcription-stream';
import type { TranscriptChunk } from '@/lib/streaming/types';

export type TranscriptionState = 'idle' | 'recording' | 'transcribing';

interface UseVoiceTranscriptionOptions {
  stream: MediaStream | null | undefined;
  enabled: boolean;
}

interface ToggleRecordingResult {
  ok: boolean;
  error?: string;
}

interface UseVoiceTranscriptionResult {
  state: TranscriptionState;
  chunks: TranscriptChunk[];
  timings: TranscriptionTimings | null;
  error: string | null;
  toggleRecording: () => Promise<ToggleRecordingResult>;
  reset: () => void;
}

async function transcribeWithFallback(
  formData: FormData,
  recordedDurationMs: number,
  onDelta: (text: string, chunkId: string) => void,
): Promise<{ transcript: string; timings: TranscriptionTimings }> {
  const requestStartedAt = performance.now();
  let firstTokenAt: number | null = null;
  const streamingChunkId = createUuid();

  const streamResponse = await fetch('/api/transcribe/stream', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (streamResponse.headers.get('content-type')?.includes('text/event-stream')) {
    const streamResult = await consumeTranscriptionStream(streamResponse, (text) => {
      if (firstTokenAt === null) {
        firstTokenAt = performance.now();
      }
      onDelta(text, streamingChunkId);
    });

    if (streamResult.error) {
      throw new Error(streamResult.error);
    }

    if (streamResult.done) {
      const requestFinishedAt = performance.now();
      const networkMs = requestFinishedAt - requestStartedAt;
      const { transcript, timings: serverTimings } = streamResult.done;

      return {
        transcript,
        timings: {
          ...serverTimings,
          audioDurationMs: serverTimings.audioDurationMs || recordedDurationMs,
          networkMs,
          totalMs: networkMs,
          timeToFirstTokenMs:
            firstTokenAt !== null
              ? firstTokenAt - requestStartedAt
              : serverTimings.apiTimeToFirstTokenMs,
        },
      };
    }
  }

  const requestStartedAtFallback = performance.now();
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const requestFinishedAt = performance.now();

  const payload = (await response.json()) as {
    transcript?: string;
    timings?: TranscriptionTimings;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? 'Transcription request failed.');
  }

  const transcript = payload.transcript?.trim();
  if (!transcript) {
    throw new Error('Gemini returned an empty transcript.');
  }

  const networkMs = requestFinishedAt - requestStartedAtFallback;
  const serverTimings = payload.timings;

  return {
    transcript,
    timings: {
      audioDurationMs: serverTimings?.audioDurationMs ?? recordedDurationMs,
      encodeMs: serverTimings?.encodeMs ?? 0,
      networkMs,
      apiMs: serverTimings?.apiMs ?? 0,
      totalMs: networkMs,
      timeToFirstTokenMs: null,
      apiTimeToFirstTokenMs: null,
    },
  };
}

export function useVoiceTranscription({
  stream,
  enabled,
}: UseVoiceTranscriptionOptions): UseVoiceTranscriptionResult {
  const [state, setState] = useState<TranscriptionState>('idle');
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [timings, setTimings] = useState<TranscriptionTimings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<ReturnType<typeof createAudioRecorder> | null>(null);
  const streamingChunkIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    recorderRef.current = null;
    streamingChunkIdRef.current = null;
    setState('idle');
    setChunks([]);
    setTimings(null);
    setError(null);
  }, []);

  const toggleRecording = useCallback(async (): Promise<ToggleRecordingResult> => {
    if (!enabled || !stream) {
      const message = 'Connect and enable the microphone before recording.';
      setError(message);
      return { ok: false, error: message };
    }

    const mimeType = getRecorderMimeType();
    if (!mimeType) {
      const message = "This browser doesn't support a compatible audio recording format.";
      setError(message);
      return { ok: false, error: message };
    }

    if (state === 'recording' && recorderRef.current?.isRecording()) {
      setState('transcribing');
      setError(null);
      streamingChunkIdRef.current = null;

      try {
        const recorded = await recorderRef.current.stop();
        recorderRef.current = null;

        if (recorded.blob.size === 0) {
          throw new Error('No audio was captured. Try speaking a little longer.');
        }

        const prepared = await prepareAudioForGemini(recorded.blob, recorded.mimeType);

        const formData = new FormData();
        formData.append('audio', prepared.blob, recordingFilename(prepared.mimeType));
        formData.append('mimeType', prepared.mimeType);
        formData.append('audioDurationMs', String(Math.round(recorded.durationMs)));

        const { transcript, timings: mergedTimings } = await transcribeWithFallback(
          formData,
          recorded.durationMs,
          (text, chunkId) => {
            if (streamingChunkIdRef.current === null) {
              streamingChunkIdRef.current = chunkId;
              setChunks((current) => [
                ...current,
                {
                  id: chunkId,
                  role: 'user',
                  text,
                  isFinal: false,
                  createdAt: Date.now(),
                },
              ]);
              return;
            }

            setChunks((current) =>
              current.map((chunk) =>
                chunk.id === chunkId ? { ...chunk, text: chunk.text + text } : chunk,
              ),
            );
          },
        );

        const finalChunkId = streamingChunkIdRef.current ?? createUuid();

        if (streamingChunkIdRef.current) {
          setChunks((current) =>
            current.map((chunk) =>
              chunk.id === finalChunkId
                ? { ...chunk, text: transcript, isFinal: true }
                : chunk,
            ),
          );
        } else {
          setChunks((current) => [
            ...current,
            {
              id: finalChunkId,
              role: 'user',
              text: transcript,
              isFinal: true,
              createdAt: Date.now(),
            },
          ]);
        }

        setTimings(mergedTimings);
        streamingChunkIdRef.current = null;
        setState('idle');
        return { ok: true };
      } catch (transcriptionError) {
        const message =
          transcriptionError instanceof Error ? transcriptionError.message : 'Transcription failed.';
        setError(message);
        streamingChunkIdRef.current = null;
        setState('idle');
        return { ok: false, error: message };
      }
    }

    if (state === 'transcribing') {
      return { ok: false };
    }

    try {
      setError(null);
      recorderRef.current = createAudioRecorder(stream, mimeType);
      recorderRef.current.start();
      setState('recording');
      return { ok: true };
    } catch (recordingError) {
      const message =
        recordingError instanceof Error ? recordingError.message : 'Could not start recording.';
      setError(message);
      setState('idle');
      return { ok: false, error: message };
    }
  }, [enabled, state, stream]);

  return {
    state,
    chunks,
    timings,
    error,
    toggleRecording,
    reset,
  };
}
