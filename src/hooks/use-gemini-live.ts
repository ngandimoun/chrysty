'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { resolveActiveAstraKey, uploadAstraKeyHeaders } from '@/lib/astra/identity';
import {
  primeAudioForPlayback,
  primeAudioForVoiceSession,
  unlockSharedAudioContextSync,
} from '@/lib/audio/audio-context';
import { startLivePcmCapture, type LivePcmCapture } from '@/lib/audio/live/pcm-capture';
import { StreamingAudioPlayer } from '@/lib/audio/streaming-player';
import { loadCompanionProfileForRequest } from '@/lib/client/append-reference-documents';
import { collectUserContextForRequest } from '@/lib/client/collect-user-context';
import { getLiveWebSocketUrl, isLiveJourneyDebugEnabled } from '@/lib/gemini/config';
import { buildUserContext } from '@/lib/gemini/user-context';
import type {
  LiveClientEvent,
  LiveSessionPhase,
} from '@/lib/live/types';
import {
  LIVE_RESUMPTION_STORAGE_KEY,
  LIVE_SESSION_STORAGE_KEY,
  createLiveSessionId,
} from '@/lib/live/types';
import { consumeResponseStream } from '@/lib/streaming/consume-response-stream';
import {
  EMPTY_EXPLANATION,
  type ExplanationState,
  type GuidanceImage,
  type LiveGuideUpdate,
} from '@/lib/streaming/types';

import type { VisualCapture, VoiceRequestMode } from '@/hooks/use-voice-agent';

const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 8;
const FRAME_IDLE_INTERVAL_MS = 1000;
const FRAME_SPEAKING_INTERVAL_MS = 400;

interface UseGeminiLiveOptions {
  stream: MediaStream | null | undefined;
  getStream?: () => MediaStream | null | undefined;
  enabled: boolean;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  getVisualCapture?: () => Promise<VisualCapture[]>;
  getRequestMode?: () => VoiceRequestMode;
  onLiveGuide?: (update: LiveGuideUpdate) => void;
  onLiveGuideSpeech?: (text: string) => void;
}

interface ConnectResult {
  ok: boolean;
  error?: string;
}

export interface UseGeminiLiveResult {
  phase: LiveSessionPhase;
  isModelSpeaking: boolean;
  isSpeaking: boolean;
  explanation: ExplanationState;
  error: string | null;
  connect: () => Promise<ConnectResult>;
  disconnect: () => void;
  dismissExplanation: () => void;
  reset: () => void;
  sendMonitorTurn: (capture: VisualCapture | null) => Promise<{ ok: boolean; error?: string }>;
  sendBootstrapTurn: (capture: VisualCapture | null) => Promise<{ ok: boolean; error?: string }>;
}

function debugLiveJourney(event: string, payload?: Record<string, unknown>) {
  if (!isLiveJourneyDebugEnabled()) return;
  console.info('[live-journey]', event, payload ?? {});
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return createLiveSessionId();
  const stored = sessionStorage.getItem(LIVE_SESSION_STORAGE_KEY);
  if (stored) return stored;
  const created = createLiveSessionId();
  sessionStorage.setItem(LIVE_SESSION_STORAGE_KEY, created);
  return created;
}

function getStoredResumptionHandle(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(LIVE_RESUMPTION_STORAGE_KEY);
}

function storeResumptionHandle(handle: string | undefined) {
  if (!handle || typeof window === 'undefined') return;
  sessionStorage.setItem(LIVE_RESUMPTION_STORAGE_KEY, handle);
}

function clearResumptionHandle() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(LIVE_RESUMPTION_STORAGE_KEY);
}

function liveUserId(astraKey: string): string {
  return astraKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'anonymous';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useGeminiLive({
  stream,
  getStream,
  enabled,
  onSpeakingStart,
  onSpeakingEnd,
  getVisualCapture,
  getRequestMode,
  onLiveGuide,
  onLiveGuideSpeech,
}: UseGeminiLiveOptions): UseGeminiLiveResult {
  const [phase, setPhase] = useState<LiveSessionPhase>('idle');
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationState>(EMPTY_EXPLANATION);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcmCaptureRef = useRef<LivePcmCapture | null>(null);
  const playerRef = useRef<StreamingAudioPlayer | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const delegationAbortRef = useRef<AbortController | null>(null);
  const activeDelegationTurnRef = useRef<string | null>(null);
  const explanationImageUrlsRef = useRef<string[]>([]);
  const frameTimerRef = useRef<number | null>(null);
  const lastFrameSentAtRef = useRef(0);
  const isModelSpeakingRef = useRef(false);

  useEffect(() => {
    isModelSpeakingRef.current = isModelSpeaking;
  }, [isModelSpeaking]);

  const getStreamRef = useRef(getStream);
  const getVisualCaptureRef = useRef(getVisualCapture);
  const getRequestModeRef = useRef(getRequestMode);
  const onLiveGuideRef = useRef(onLiveGuide);
  const onLiveGuideSpeechRef = useRef(onLiveGuideSpeech);
  const onSpeakingStartRef = useRef(onSpeakingStart);
  const onSpeakingEndRef = useRef(onSpeakingEnd);

  useEffect(() => {
    getStreamRef.current = getStream;
  }, [getStream]);
  useEffect(() => {
    getVisualCaptureRef.current = getVisualCapture;
  }, [getVisualCapture]);
  useEffect(() => {
    getRequestModeRef.current = getRequestMode;
  }, [getRequestMode]);
  useEffect(() => {
    onLiveGuideRef.current = onLiveGuide;
  }, [onLiveGuide]);
  useEffect(() => {
    onLiveGuideSpeechRef.current = onLiveGuideSpeech;
  }, [onLiveGuideSpeech]);
  useEffect(() => {
    onSpeakingStartRef.current = onSpeakingStart;
  }, [onSpeakingStart]);
  useEffect(() => {
    onSpeakingEndRef.current = onSpeakingEnd;
  }, [onSpeakingEnd]);

  const clearExplanationImages = useCallback(() => {
    for (const url of explanationImageUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
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
        setIsModelSpeaking(true);
        onSpeakingStartRef.current?.();
      });
      player.setOnPlaybackEnd(() => {
        setIsModelSpeaking(false);
        onSpeakingEndRef.current?.();
      });
      playerRef.current = player;
    }
    return playerRef.current;
  }, []);

  const stopPcmCapture = useCallback(() => {
    pcmCaptureRef.current?.stop();
    pcmCaptureRef.current = null;
  }, []);

  const stopFrameTimer = useCallback(() => {
    if (frameTimerRef.current !== null) {
      window.clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
  }, []);

  const closeWebSocket = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }, []);

  const stopDelegationStream = useCallback(() => {
    delegationAbortRef.current?.abort();
    delegationAbortRef.current = null;
    activeDelegationTurnRef.current = null;
  }, []);

  const openDelegationStream = useCallback(
    async (turnId: string) => {
      if (activeDelegationTurnRef.current === turnId) return;
      activeDelegationTurnRef.current = turnId;
      stopDelegationStream();

      const abort = new AbortController();
      delegationAbortRef.current = abort;

      debugLiveJourney('delegation_sse_open', { turn_id: turnId });

      const response = await fetch(`/api/live/delegate/stream?turn_id=${encodeURIComponent(turnId)}`, {
        method: 'GET',
        credentials: 'include',
        headers: uploadAstraKeyHeaders(),
        signal: abort.signal,
      });

      const visuals = (await getVisualCaptureRef.current?.()) ?? [];
      const userImages: GuidanceImage[] = visuals.map((visual, index) => {
        const url = URL.createObjectURL(visual.blob);
        explanationImageUrlsRef.current.push(url);
        return {
          id: visual.imageId || `capture-${index + 1}`,
          url,
          mimeType: visual.mimeType,
          width: visual.width,
          height: visual.height,
          captureMode: visual.captureMode,
        };
      });

      await consumeResponseStream(response, {
        onAudio: () => {},
        onExplanationStart: (visualsPayload) => {
          setExplanation({
            active: true,
            fullText: '',
            isStreaming: true,
            places: visualsPayload.places,
            charts: visualsPayload.charts,
            codeImages: visualsPayload.codeImages,
            stockImages: visualsPayload.stockImages,
            webCitations: visualsPayload.webCitations,
            customToolCalls: visualsPayload.customToolCalls,
            physicalTask: visualsPayload.physicalTask,
            visualGuidance: visualsPayload.visualGuidance,
            userImages,
          });
        },
        onExplanationDelta: (text) => {
          setExplanation((current) => ({
            ...current,
            active: true,
            fullText: current.fullText + text,
            isStreaming: true,
          }));
        },
        onExplanationDone: (text, visualsPayload) => {
          setExplanation({
            active: true,
            fullText: text,
            isStreaming: false,
            places: visualsPayload.places,
            charts: visualsPayload.charts,
            codeImages: visualsPayload.codeImages,
            stockImages: visualsPayload.stockImages,
            webCitations: visualsPayload.webCitations,
            customToolCalls: visualsPayload.customToolCalls,
            physicalTask: visualsPayload.physicalTask,
            visualGuidance: visualsPayload.visualGuidance,
            userImages,
          });
        },
        onLiveGuide: (update) => {
          onLiveGuideRef.current?.(update);
        },
      });

      if (activeDelegationTurnRef.current === turnId) {
        activeDelegationTurnRef.current = null;
      }
    },
    [stopDelegationStream],
  );

  const sendImageOverSocket = useCallback(async (visual: VisualCapture) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const prepared = visual;
    const data = await blobToBase64(prepared.blob);
    ws.send(
      JSON.stringify({
        type: 'image',
        data,
        mimeType: prepared.mimeType,
      }),
    );
    lastFrameSentAtRef.current = performance.now();
  }, []);

  const maybeSendCameraFrame = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const interval = isModelSpeakingRef.current ? FRAME_SPEAKING_INTERVAL_MS : FRAME_IDLE_INTERVAL_MS;
    if (performance.now() - lastFrameSentAtRef.current < interval) return;

    const visuals = await getVisualCaptureRef.current?.();
    const first = visuals?.[0];
    if (!first) return;

    await sendImageOverSocket(first);
  }, [sendImageOverSocket]);

  const startFrameTimer = useCallback(() => {
    stopFrameTimer();
    frameTimerRef.current = window.setInterval(() => {
      void maybeSendCameraFrame();
    }, FRAME_IDLE_INTERVAL_MS);
  }, [maybeSendCameraFrame, stopFrameTimer]);

  const startMicCapture = useCallback(
    async (mediaStream: MediaStream) => {
      stopPcmCapture();
      pcmCaptureRef.current = await startLivePcmCapture(mediaStream, (chunk) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      });
    },
    [stopPcmCapture],
  );

  const handleClientEvent = useCallback(
    (event: LiveClientEvent) => {
      switch (event.type) {
        case 'connected':
          debugLiveJourney('connected', { session_id: event.session_id, mode: event.mode });
          setPhase('live');
          reconnectAttemptsRef.current = 0;
          if (event.pending_turn_id) {
            void openDelegationStream(event.pending_turn_id);
          }
          startFrameTimer();
          break;
        case 'audio':
          void getPlayer().enqueue({
            data: event.data,
            sample_rate: event.sample_rate ?? 24000,
          });
          break;
        case 'delegation_started':
          debugLiveJourney('delegation_started', { turn_id: event.turn_id });
          void openDelegationStream(event.turn_id);
          break;
        case 'simple_explanation':
          onLiveGuideSpeechRef.current?.(event.text);
          setExplanation({
            active: true,
            fullText: event.text,
            isStreaming: false,
            places: [],
            charts: [],
            codeImages: [],
            stockImages: [],
            webCitations: [],
            customToolCalls: [],
            physicalTask: null,
            visualGuidance: null,
            userImages: [],
          });
          break;
        case 'live_guide_update':
          onLiveGuideRef.current?.({
            liveGuide: event.live_guide,
            guidanceMode: event.guidance_mode === 'live_requested' ? 'live_requested' : 'static',
            monitor: false,
          });
          break;
        case 'go_away':
          debugLiveJourney('go_away', {
            resumption_handle: event.resumption_handle,
            time_left: event.time_left,
          });
          storeResumptionHandle(event.resumption_handle);
          setPhase('reconnecting');
          break;
        case 'error':
          setError(event.message);
          setPhase('error');
          break;
        case 'reconnecting':
          setPhase('reconnecting');
          break;
        default:
          break;
      }
    },
    [getPlayer, openDelegationStream, startFrameTimer],
  );

  const openWebSocket = useCallback(async (): Promise<ConnectResult> => {
    const baseUrl = getLiveWebSocketUrl();
    if (!baseUrl) {
      return { ok: false, error: 'Live WebSocket URL is not configured.' };
    }

    const astraKey = resolveActiveAstraKey();
    if (!astraKey) {
      return { ok: false, error: 'Sign in to use Gemini Live.' };
    }

    const mediaStream = getStreamRef.current?.() ?? stream ?? null;
    if (!mediaStream) {
      return { ok: false, error: 'Microphone is not available.' };
    }

    primeAudioForVoiceSession();
    unlockSharedAudioContextSync('play-and-record');
    await primeAudioForPlayback();

    const sessionId = getOrCreateSessionId();
    const userId = liveUserId(astraKey);
    const wsUrl = `${baseUrl.replace(/\/$/, '')}/ws/${encodeURIComponent(userId)}/${encodeURIComponent(sessionId)}`;

    intentionalCloseRef.current = false;
    setPhase(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');
    setError(null);

    const userContextFields = await collectUserContextForRequest();
    const userContext = buildUserContext(userContextFields);
    const companionProfile = await loadCompanionProfileForRequest();
    const mode = getRequestModeRef.current?.() ?? 'default';

    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        void (async () => {
          ws.send(
            JSON.stringify({
              type: 'init',
              astra_key: astraKey,
              mode,
              companion_profile: companionProfile,
              user_context: userContext,
              resumption_handle: getStoredResumptionHandle(),
            }),
          );
          try {
            await startMicCapture(mediaStream);
          } catch (captureError) {
            const message =
              captureError instanceof Error ? captureError.message : 'Could not start microphone capture.';
            setError(message);
            setPhase('error');
            ws.close();
            resolve({ ok: false, error: message });
          }
        })();
      };

      ws.onmessage = (message) => {
        if (typeof message.data !== 'string') return;
        try {
          const event = JSON.parse(message.data) as LiveClientEvent;
          handleClientEvent(event);
          if (event.type === 'connected') {
            resolve({ ok: true });
          } else if (event.type === 'error') {
            resolve({ ok: false, error: event.message });
          }
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onerror = () => {
        if (!intentionalCloseRef.current) {
          setError('Live connection failed.');
          setPhase('error');
        }
        resolve({ ok: false, error: 'Live connection failed.' });
      };

      ws.onclose = () => {
        wsRef.current = null;
        stopPcmCapture();
        stopFrameTimer();
        getPlayer().stop();
        setIsModelSpeaking(false);

        if (intentionalCloseRef.current) {
          setPhase('idle');
          return;
        }

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError('Could not reconnect to Live.');
          setPhase('error');
          return;
        }

        reconnectAttemptsRef.current += 1;
        setPhase('reconnecting');
        reconnectTimerRef.current = window.setTimeout(() => {
          void openWebSocket();
        }, RECONNECT_DELAY_MS);
      };
    });
  }, [handleClientEvent, startMicCapture, stopFrameTimer, stopPcmCapture, stream]);

  const connect = useCallback(async (): Promise<ConnectResult> => {
    if (!enabled) {
      return { ok: false, error: 'Live session is not enabled.' };
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return { ok: true };
    }
    return openWebSocket();
  }, [enabled, openWebSocket]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    reconnectAttemptsRef.current = 0;
    clearResumptionHandle();
    stopDelegationStream();
    closeWebSocket();
    stopPcmCapture();
    stopFrameTimer();
    getPlayer().stop();
    setIsModelSpeaking(false);
    setPhase('idle');
  }, [closeWebSocket, getPlayer, stopDelegationStream, stopFrameTimer, stopPcmCapture]);

  const reset = useCallback(() => {
    disconnect();
    clearExplanation();
    setError(null);
  }, [clearExplanation, disconnect]);

  const dismissExplanation = useCallback(() => {
    clearExplanation();
  }, [clearExplanation]);

  const sendVisualOverSocket = useCallback(
    async (capture: VisualCapture | null): Promise<{ ok: boolean; error?: string }> => {
      if (!capture) return { ok: false, error: 'No visual capture.' };
      try {
        await sendImageOverSocket(capture);
        return { ok: true };
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : 'Could not send image.';
        return { ok: false, error: message };
      }
    },
    [sendImageOverSocket],
  );

  useEffect(() => {
    if (!enabled) {
      reset();
    }
  }, [enabled, reset]);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      closeWebSocket();
      stopPcmCapture();
      stopFrameTimer();
      stopDelegationStream();
      void playerRef.current?.close();
      playerRef.current = null;
      clearExplanationImages();
    };
  }, [clearExplanationImages, closeWebSocket, stopDelegationStream, stopFrameTimer, stopPcmCapture]);

  return {
    phase,
    isModelSpeaking,
    isSpeaking: isModelSpeaking,
    explanation,
    error,
    connect,
    disconnect,
    dismissExplanation,
    reset,
    sendMonitorTurn: sendVisualOverSocket,
    sendBootstrapTurn: sendVisualOverSocket,
  };
}
