'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getSharedAudioContextState,
  primeAudioForPlayback,
  primeAudioForVoiceSession,
  unlockSharedAudioContextSync,
} from '@/lib/audio/audio-context';
import { prepareAudioForGemini, recordingFilename } from '@/lib/audio/convert';
import { getRecorderMimeType } from '@/lib/audio/mime';
import { createAudioRecorder } from '@/lib/audio/record';
import { base64ToPcmBytes, concatPcmChunks } from '@/lib/audio/pcm-to-wav';
import { StreamingAudioPlayer } from '@/lib/audio/streaming-player';
import { uploadAstraKeyHeaders } from '@/lib/astra/identity';
import {
  appendReferenceDocumentsToFormData,
  loadCompanionProfileForRequest,
  loadReferenceDocumentsForRequest,
} from '@/lib/client/append-reference-documents';
import { appendCompanionProfileToFormData } from '@/lib/client/companion-profile';
import {
  appendUserContextToFormData,
  collectUserContextForRequest,
} from '@/lib/client/collect-user-context';
import type { CaptureMode, FocusAnnotation } from '@/lib/camera/types';
import type { ResponseTimings } from '@/lib/gemini/config';
import { formatUserFacingGeminiError } from '@/lib/gemini/user-facing-error';
import type { PerceptionSnapshot } from '@/lib/perception/types';
import { consumeResponseStream } from '@/lib/streaming/consume-response-stream';
import {
  EMPTY_EXPLANATION,
  type ExplanationState,
  type GuidanceImage,
  type LiveGuideUpdate,
} from '@/lib/streaming/types';

export type AgentState = 'idle' | 'recording' | 'processing';

export type VoiceRequestMode = 'default' | 'live_guide';

export interface VisualCapture {
  imageId?: string;
  blob: Blob;
  mimeType: string;
  captureMode: CaptureMode;
  width: number;
  height: number;
  focusAnnotations?: FocusAnnotation[];
  perception?: PerceptionSnapshot;
}

interface UseVoiceAgentOptions {
  stream: MediaStream | null | undefined;
  getStream?: () => MediaStream | null | undefined;
  enabled: boolean;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  onRecordingStart?: () => void;
  getVisualCapture?: () => Promise<VisualCapture[]>;
  /** Request mode appended to each send; live_guide turns render directives on the live camera. */
  getRequestMode?: () => VoiceRequestMode;
  /** Compact previous Live Guide state forwarded to the model for continuity. */
  getLiveGuideContext?: () => string | null;
  onLiveGuide?: (update: LiveGuideUpdate) => void;
  onLiveGuideSpeech?: (text: string) => void;
}

interface RecordingResult {
  ok: boolean;
  error?: string;
}

export interface LastResponseAudio {
  pcm: Uint8Array;
  sampleRate: number;
}

interface UseVoiceAgentResult {
  state: AgentState;
  isSpeaking: boolean;
  playbackBlocked: boolean;
  timings: ResponseTimings | null;
  error: string | null;
  explanation: ExplanationState;
  lastResponseAudio: LastResponseAudio | null;
  startRecording: () => Promise<RecordingResult>;
  stopRecordingAndSend: () => Promise<RecordingResult>;
  toggleRecording: () => Promise<RecordingResult>;
  cancelRecording: () => Promise<void>;
  sendMonitorTurn: (capture: VisualCapture | null) => Promise<RecordingResult>;
  sendBootstrapTurn: (capture: VisualCapture | null) => Promise<RecordingResult>;
  stopSpeaking: () => void;
  replayLastResponseAudio: () => Promise<void>;
  dismissExplanation: () => void;
  clearLastResponseAudio: () => void;
  reset: () => void;
}

function imageFilename(mimeType: string, index: number): string {
  if (mimeType === 'image/png') return `capture-${index}.png`;
  return `capture-${index}.jpg`;
}

export function useVoiceAgent({
  stream,
  getStream,
  onSpeakingStart,
  onSpeakingEnd,
  onRecordingStart,
  getVisualCapture,
  getRequestMode,
  getLiveGuideContext,
  onLiveGuide,
  onLiveGuideSpeech,
}: UseVoiceAgentOptions): UseVoiceAgentResult {
  const [state, setState] = useState<AgentState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [timings, setTimings] = useState<ResponseTimings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<ExplanationState>(EMPTY_EXPLANATION);
  const [lastResponseAudio, setLastResponseAudio] = useState<LastResponseAudio | null>(null);

  const recorderRef = useRef<ReturnType<typeof createAudioRecorder> | null>(null);
  const playerRef = useRef<StreamingAudioPlayer | null>(null);
  const requestStartedAtRef = useRef<number | null>(null);
  const firstAudioAtRef = useRef<number | null>(null);
  const onSpeakingStartRef = useRef(onSpeakingStart);
  const onSpeakingEndRef = useRef(onSpeakingEnd);
  const onRecordingStartRef = useRef(onRecordingStart);
  const getVisualCaptureRef = useRef(getVisualCapture);
  const getStreamRef = useRef(getStream);
  const explanationImageUrlsRef = useRef<string[]>([]);
  const ttsErrorRef = useRef<string | null>(null);
  const getRequestModeRef = useRef(getRequestMode);
  const getLiveGuideContextRef = useRef(getLiveGuideContext);
  const onLiveGuideRef = useRef(onLiveGuide);
  const onLiveGuideSpeechRef = useRef(onLiveGuideSpeech);
  const monitorAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onSpeakingStartRef.current = onSpeakingStart;
    onSpeakingEndRef.current = onSpeakingEnd;
    onRecordingStartRef.current = onRecordingStart;
    getVisualCaptureRef.current = getVisualCapture;
    getStreamRef.current = getStream;
    getRequestModeRef.current = getRequestMode;
    getLiveGuideContextRef.current = getLiveGuideContext;
    onLiveGuideRef.current = onLiveGuide;
    onLiveGuideSpeechRef.current = onLiveGuideSpeech;
  }, [
    getLiveGuideContext,
    getRequestMode,
    getStream,
    getVisualCapture,
    onLiveGuide,
    onLiveGuideSpeech,
    onRecordingStart,
    onSpeakingEnd,
    onSpeakingStart,
  ]);

  const clearExplanationImages = useCallback(() => {
    explanationImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    explanationImageUrlsRef.current = [];
  }, []);

  const clearExplanation = useCallback(() => {
    clearExplanationImages();
    setExplanation(EMPTY_EXPLANATION);
  }, [clearExplanationImages]);

  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      const player = new StreamingAudioPlayer();
      player.setOnFirstAudio(() => {
        if (firstAudioAtRef.current === null && requestStartedAtRef.current !== null) {
          firstAudioAtRef.current = performance.now();
        }
        setPlaybackBlocked(false);
        console.info('[audio] first audio playback started', {
          contextState: player.getState(),
        });
        setIsSpeaking(true);
        onSpeakingStartRef.current?.();
      });
      player.setOnPlaybackEnd(() => {
        setIsSpeaking(false);
        onSpeakingEndRef.current?.();
      });
      playerRef.current = player;
    }

    return playerRef.current;
  }, []);

  const stopSpeaking = useCallback(() => {
    playerRef.current?.stop();
    setIsSpeaking(false);
  }, []);

  const clearLastResponseAudio = useCallback(() => {
    setLastResponseAudio(null);
  }, []);

  const reset = useCallback(() => {
    const activeRecorder = recorderRef.current;
    recorderRef.current = null;
    void activeRecorder?.stop().catch(() => {});
    monitorAbortRef.current?.abort();
    monitorAbortRef.current = null;
    requestStartedAtRef.current = null;
    firstAudioAtRef.current = null;
    ttsErrorRef.current = null;
    playerRef.current?.stop();
    clearExplanationImages();
    setState('idle');
    setIsSpeaking(false);
    setPlaybackBlocked(false);
    setTimings(null);
    setError(null);
    clearExplanation();
    setLastResponseAudio(null);
  }, [clearExplanation, clearExplanationImages]);

  useEffect(() => {
    return () => {
      clearExplanationImages();
      void playerRef.current?.close();
      playerRef.current = null;
    };
  }, [clearExplanationImages]);

  const sendRecording = useCallback(async (): Promise<RecordingResult> => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return { ok: false, error: 'No active recording.' };
    }

    setState('processing');
    setError(null);
    ttsErrorRef.current = null;
    stopSpeaking();
    monitorAbortRef.current?.abort();
    monitorAbortRef.current = null;
    setLastResponseAudio(null);
    requestStartedAtRef.current = performance.now();
    firstAudioAtRef.current = null;

    const pcmChunks: Uint8Array[] = [];
    let responseSampleRate = 24000;

    try {
      const recorded = await recorder.stop();
      recorderRef.current = null;

      if (recorded.blob.size === 0) {
        throw new Error('No audio was captured. Try speaking a little longer.');
      }

      const prepared = await prepareAudioForGemini(recorded.blob, recorded.mimeType);
      clearExplanationImages();
      const visuals = (await getVisualCaptureRef.current?.()) ?? [];
      const visualsWithIds = visuals.map((visual, index) => ({
        ...visual,
        imageId: visual.imageId || `capture-${index + 1}`,
      }));
      const userImages: GuidanceImage[] = visualsWithIds.map((visual) => {
        const url = URL.createObjectURL(visual.blob);
        explanationImageUrlsRef.current.push(url);
        return {
          id: visual.imageId,
          url,
          mimeType: visual.mimeType,
          width: visual.width,
          height: visual.height,
          captureMode: visual.captureMode,
        };
      });
      const userContextFields = await collectUserContextForRequest();
      const referenceDocuments = await loadReferenceDocumentsForRequest();

      const formData = new FormData();
      formData.append('audio', prepared.blob, recordingFilename(prepared.mimeType));
      formData.append('mimeType', prepared.mimeType);
      formData.append('audioDurationMs', String(Math.round(recorded.durationMs)));
      appendUserContextToFormData(formData, userContextFields);
      appendCompanionProfileToFormData(formData, await loadCompanionProfileForRequest());
      appendReferenceDocumentsToFormData(formData, referenceDocuments);

      const requestMode = getRequestModeRef.current?.() ?? 'default';
      if (requestMode !== 'default') {
        formData.append('mode', requestMode);
        const liveGuideContext = getLiveGuideContextRef.current?.();
        if (liveGuideContext) {
          formData.append('liveGuideContext', liveGuideContext);
        }
      }

      if (visualsWithIds.length > 0) {
        visualsWithIds.forEach((visual, index) => {
          formData.append('images', visual.blob, imageFilename(visual.mimeType, index));
        });
        formData.append(
          'imagesMeta',
          JSON.stringify(
            visualsWithIds.map((visual) => ({
              imageId: visual.imageId,
              mimeType: visual.mimeType,
              width: visual.width,
              height: visual.height,
              captureMode: visual.captureMode,
              ...(visual.focusAnnotations?.length ? { focusAnnotations: visual.focusAnnotations } : {}),
              ...(visual.perception ? { perception: visual.perception } : {}),
            })),
          ),
        );

        if (
          process.env.NODE_ENV === 'development' ||
          process.env.NEXT_PUBLIC_DEBUG_CAPTURE === 'true'
        ) {
          console.debug(
            '[capture]',
            visualsWithIds.map((visual) => ({
              imageId: visual.imageId,
              width: visual.width,
              height: visual.height,
              bytes: visual.blob.size,
              captureMode: visual.captureMode,
              ...(visual.focusAnnotations?.length ? { focusAnnotations: visual.focusAnnotations } : {}),
              ...(visual.perception ? { perception: visual.perception } : {}),
            })),
          );
        }
      }

      const player = getPlayer();
      const pendingEnqueues: Promise<void>[] = [];
      const response = await fetch('/api/respond/stream', {
        method: 'POST',
        credentials: 'include',
        headers: uploadAstraKeyHeaders(),
        body: formData,
      });

      const streamResult = await consumeResponseStream(response, {
        onExplanationStart: (visuals) => {
          setExplanation({
            active: true,
            fullText: '',
            isStreaming: true,
            places: visuals.places,
            charts: visuals.charts,
            codeImages: visuals.codeImages,
            stockImages: visuals.stockImages,
            webCitations: visuals.webCitations,
            customToolCalls: visuals.customToolCalls,
            physicalTask: visuals.physicalTask,
            visualGuidance: visuals.visualGuidance,
            userImages,
            artifactLanguage: visuals.artifactLanguage,
          });
        },
        onExplanationDelta: (text) => {
          setExplanation((current) => ({
            active: true,
            fullText: current.fullText + text,
            isStreaming: true,
            places: current.places,
            charts: current.charts,
            codeImages: current.codeImages,
            stockImages: current.stockImages,
            webCitations: current.webCitations,
            customToolCalls: current.customToolCalls,
            physicalTask: current.physicalTask,
            visualGuidance: current.visualGuidance,
            userImages: current.userImages,
          }));
        },
        onExplanationDone: (text, visuals) => {
          setExplanation({
            active: true,
            fullText: text,
            isStreaming: false,
            places: visuals.places,
            charts: visuals.charts,
            codeImages: visuals.codeImages,
            stockImages: visuals.stockImages,
            webCitations: visuals.webCitations,
            customToolCalls: visuals.customToolCalls,
            physicalTask: visuals.physicalTask,
            visualGuidance: visuals.visualGuidance,
            userImages,
            artifactLanguage: visuals.artifactLanguage,
          });
        },
        onLiveGuide: (update) => {
          onLiveGuideRef.current?.(update);
        },
        onAudio: (chunk) => {
          responseSampleRate = chunk.sample_rate ?? responseSampleRate;
          pcmChunks.push(base64ToPcmBytes(chunk.data));
          pendingEnqueues.push(player.enqueue(chunk));
        },
        onTtsError: (message) => {
          ttsErrorRef.current = message;
          setError(formatUserFacingGeminiError(`Voice unavailable: ${message}`));
        },
      });

      if (streamResult.error) {
        throw new Error(streamResult.error);
      }

      if (!streamResult.done) {
        throw new Error('Response ended before completion.');
      }

      const spokenFallback = streamResult.done.spokenTranscript?.trim();
      if (spokenFallback) {
        onLiveGuideSpeechRef.current?.(spokenFallback);
      }
      if (ttsErrorRef.current && pcmChunks.length === 0 && spokenFallback) {
        setExplanation((current) =>
          current.active
            ? current
            : {
                ...EMPTY_EXPLANATION,
                active: true,
                fullText: spokenFallback,
                userImages,
              },
        );
      }

      const requestStartedAt = requestStartedAtRef.current ?? performance.now();

      setTimings({
        ...streamResult.done.timings,
        audioDurationMs: streamResult.done.timings.audioDurationMs || recorded.durationMs,
        totalMs: 0,
        timeToFirstAudioMs: null,
      });

      await Promise.all(pendingEnqueues);
      await player.flush();

      const requestFinishedAt = performance.now();
      const firstAudioAt = firstAudioAtRef.current;

      setTimings({
        ...streamResult.done.timings,
        audioDurationMs: streamResult.done.timings.audioDurationMs || recorded.durationMs,
        totalMs: requestFinishedAt - requestStartedAt,
        timeToFirstAudioMs: firstAudioAt !== null ? firstAudioAt - requestStartedAt : null,
      });

      const mergedPcm = concatPcmChunks(pcmChunks);
      if (mergedPcm.length > 0) {
        setLastResponseAudio({ pcm: mergedPcm, sampleRate: responseSampleRate });
        if (firstAudioAtRef.current === null && !player.hasStartedPlayback()) {
          setPlaybackBlocked(true);
          console.warn('[audio] playback blocked after response', {
            contextState: getSharedAudioContextState(),
            pcmBytes: mergedPcm.length,
          });
        } else {
          setPlaybackBlocked(false);
        }
      } else {
        setPlaybackBlocked(false);
      }

      requestStartedAtRef.current = null;
      ttsErrorRef.current = null;
      setState('idle');
      return { ok: true };
    } catch (pipelineError) {
      const message = formatUserFacingGeminiError(
        pipelineError instanceof Error ? pipelineError.message : 'Could not generate a response.',
      );
      clearExplanationImages();
      setError(message);
      stopSpeaking();
      requestStartedAtRef.current = null;
      firstAudioAtRef.current = null;
      ttsErrorRef.current = null;
      setState('idle');
      return { ok: false, error: message };
    }
  }, [clearExplanationImages, getPlayer, stopSpeaking]);

  const sendLiveGuideFrameTurn = useCallback(
    async (
      capture: VisualCapture | null,
      mode: 'live_guide_monitor' | 'live_guide_bootstrap',
    ): Promise<RecordingResult> => {
      if (!capture) {
        return { ok: false, error: 'No camera frame available.' };
      }

      if (recorderRef.current?.isRecording() || monitorAbortRef.current) {
        return { ok: false };
      }

      const abort = new AbortController();
      monitorAbortRef.current = abort;

      try {
        const formData = new FormData();
        formData.append('mode', mode);
        const liveGuideContext = getLiveGuideContextRef.current?.();
        if (liveGuideContext) {
          formData.append('liveGuideContext', liveGuideContext);
        }
        appendUserContextToFormData(formData, await collectUserContextForRequest());
        formData.append('images', capture.blob, imageFilename(capture.mimeType, 0));
        formData.append(
          'imagesMeta',
          JSON.stringify([
            {
              imageId: capture.imageId || 'capture-1',
              mimeType: capture.mimeType,
              width: capture.width,
              height: capture.height,
              captureMode: capture.captureMode,
            },
          ]),
        );

        const player = getPlayer();
        const pendingEnqueues: Promise<void>[] = [];
        const response = await fetch('/api/respond/stream', {
          method: 'POST',
          credentials: 'include',
          headers: uploadAstraKeyHeaders(),
          body: formData,
          signal: abort.signal,
        });

        const streamResult = await consumeResponseStream(response, {
          onLiveGuide: (update) => {
            onLiveGuideRef.current?.(update);
          },
          onAudio: (chunk) => {
            pendingEnqueues.push(player.enqueue(chunk));
          },
        });

        if (streamResult.error) {
          return { ok: false, error: streamResult.error };
        }

        const spoken = streamResult.done?.spokenTranscript?.trim();
        if (spoken) {
          onLiveGuideSpeechRef.current?.(spoken);
        }

        await Promise.all(pendingEnqueues);
        await player.flush();
        return { ok: true };
      } catch (frameTurnError) {
        if (abort.signal.aborted) {
          return { ok: false };
        }
        return {
          ok: false,
          error: frameTurnError instanceof Error ? frameTurnError.message : 'Live Guide turn failed.',
        };
      } finally {
        if (monitorAbortRef.current === abort) {
          monitorAbortRef.current = null;
        }
      }
    },
    [getPlayer],
  );

  const sendMonitorTurn = useCallback(
    async (capture: VisualCapture | null): Promise<RecordingResult> => {
      return sendLiveGuideFrameTurn(capture, 'live_guide_monitor');
    },
    [sendLiveGuideFrameTurn],
  );

  const sendBootstrapTurn = useCallback(
    async (capture: VisualCapture | null): Promise<RecordingResult> => {
      return sendLiveGuideFrameTurn(capture, 'live_guide_bootstrap');
    },
    [sendLiveGuideFrameTurn],
  );

  const startRecording = useCallback(async (): Promise<RecordingResult> => {
    const activeStream = getStreamRef.current?.() ?? stream;
    if (!activeStream) {
      const message = formatUserFacingGeminiError('Connect before recording.');
      setError(message);
      return { ok: false, error: message };
    }

    const mimeType = getRecorderMimeType();
    if (!mimeType) {
      const message = formatUserFacingGeminiError(
        "This browser doesn't support a compatible audio recording format.",
      );
      setError(message);
      return { ok: false, error: message };
    }

    if (state === 'processing') {
      return { ok: false };
    }

    if (recorderRef.current?.isRecording()) {
      setState('recording');
      return { ok: true };
    }

    try {
      primeAudioForVoiceSession();
      unlockSharedAudioContextSync('play-and-record');
      setError(null);
      stopSpeaking();
      setLastResponseAudio(null);
      setPlaybackBlocked(false);
      recorderRef.current = createAudioRecorder(activeStream, mimeType);
      recorderRef.current.start();
      setState('recording');
      onRecordingStartRef.current?.();
      return { ok: true };
    } catch (recordingError) {
      const message = formatUserFacingGeminiError(
        recordingError instanceof Error ? recordingError.message : 'Could not start recording.',
      );
      setError(message);
      setState('idle');
      return { ok: false, error: message };
    }
  }, [state, stopSpeaking, stream]);

  const replayLastResponseAudio = useCallback(async (): Promise<void> => {
    if (!lastResponseAudio) return;

    const hasLiveMic = Boolean(getStreamRef.current?.() ?? stream);
    if (hasLiveMic) {
      primeAudioForVoiceSession();
      unlockSharedAudioContextSync('play-and-record');
    } else {
      primeAudioForPlayback();
      unlockSharedAudioContextSync('playback');
    }
    setPlaybackBlocked(false);
    setError(null);

    try {
      stopSpeaking();
      const player = getPlayer();
      await player.replayPcm(lastResponseAudio.pcm, lastResponseAudio.sampleRate);
      console.info('[audio] replay started', { contextState: player.getState() });
    } catch (replayError) {
      const message = formatUserFacingGeminiError(
        replayError instanceof Error ? replayError.message : 'Could not replay audio.',
      );
      setPlaybackBlocked(true);
      setError(message);
      console.warn('[audio] replay failed', replayError);
    }
  }, [getPlayer, lastResponseAudio, stopSpeaking, stream]);

  const stopRecordingAndSend = useCallback(async (): Promise<RecordingResult> => {
    if (!recorderRef.current) {
      setState('idle');
      return { ok: false, error: 'No active recording.' };
    }
    return sendRecording();
  }, [sendRecording]);

  const toggleRecording = useCallback(async (): Promise<RecordingResult> => {
    if (state === 'recording' || recorderRef.current?.isRecording()) {
      return stopRecordingAndSend();
    }
    return startRecording();
  }, [startRecording, state, stopRecordingAndSend]);

  const cancelRecording = useCallback(async (): Promise<void> => {
    const recorder = recorderRef.current;
    if (!recorder?.isRecording()) {
      recorderRef.current = null;
      setState('idle');
      return;
    }

    try {
      await recorder.stop();
    } catch {
      // discard audio on cancel
    }
    recorderRef.current = null;
    setState('idle');
    setError(null);
  }, []);

  return {
    state,
    isSpeaking,
    playbackBlocked,
    timings,
    error,
    explanation,
    lastResponseAudio,
    startRecording,
    stopRecordingAndSend,
    toggleRecording,
    cancelRecording,
    sendMonitorTurn,
    sendBootstrapTurn,
    stopSpeaking,
    replayLastResponseAudio,
    dismissExplanation: clearExplanation,
    clearLastResponseAudio,
    reset,
  };
}
