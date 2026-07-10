'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { resolveActiveAstraKey, uploadAstraKeyHeaders } from '@/lib/astra/identity';
import {
  primeAudioForVoiceSession,
  unlockSharedAudioContextSync,
} from '@/lib/audio/audio-context';
import { startLivePcmCapture, type LivePcmCapture } from '@/lib/audio/live/pcm-capture';
import { LivePcmPlayer } from '@/lib/audio/live/pcm-player';
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
  type TranscriptChunk,
} from '@/lib/streaming/types';

import type { VisualCapture, VoiceRequestMode } from '@/hooks/use-voice-agent';

const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 8;
const CONNECT_TIMEOUT_MS = 25000;
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
  transcriptChunks: TranscriptChunk[];
  error: string | null;
  prepareAudio: () => Promise<void>;
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

function clearStoredSessionId() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(LIVE_SESSION_STORAGE_KEY);
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
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const openWebSocketRef = useRef<(() => Promise<ConnectResult>) | null>(null);
  const pcmCaptureRef = useRef<LivePcmCapture | null>(null);
  const playerRef = useRef<LivePcmPlayer | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const hadStableLiveSessionRef = useRef(false);
  const resumeAfterGoAwayRef = useRef(false);
  const pendingMediaStreamRef = useRef<MediaStream | null>(null);
  const delegationAbortRef = useRef<AbortController | null>(null);
  const activeDelegationTurnRef = useRef<string | null>(null);
  const explanationImageUrlsRef = useRef<string[]>([]);
  const frameTimerRef = useRef<number | null>(null);
  const lastFrameSentAtRef = useRef(0);
  const isModelSpeakingRef = useRef(false);
  const handshakeCompleteRef = useRef(false);
  const pendingAudioRef = useRef<Array<{ data: string; sample_rate: number }>>([]);

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
      const player = new LivePcmPlayer();
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

  const enqueueLiveAudio = useCallback(
    (data: string, sampleRate: number) => {
      void getPlayer()
        .enqueue({
          data,
          sample_rate: sampleRate,
        })
        .catch((enqueueError) => {
          debugLiveJourney('audio_enqueue_failed', {
            message: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
          });
        });
    },
    [getPlayer],
  );

  const drainPendingAudio = useCallback(() => {
    const pending = pendingAudioRef.current;
    pendingAudioRef.current = [];
    for (const chunk of pending) {
      enqueueLiveAudio(chunk.data, chunk.sample_rate);
    }
  }, [enqueueLiveAudio]);

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
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
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

  const updateTranscription = useCallback(
    (role: 'user' | 'assistant', text: string, finished: boolean) => {
      if (!text) return;
      setTranscriptChunks((current) => {
        const activeIndex = current.findLastIndex(
          (chunk) => chunk.role === role && !chunk.isFinal,
        );
        if (activeIndex < 0) {
          return [
            ...current,
            {
              id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              role,
              text,
              isFinal: finished,
              createdAt: Date.now(),
            },
          ];
        }

        const updated = [...current];
        const active = updated[activeIndex];
        updated[activeIndex] = {
          ...active,
          text: finished ? text : active.text + text,
          isFinal: finished,
        };
        return updated;
      });
    },
    [],
  );

  const handleClientEvent = useCallback(
    (event: LiveClientEvent) => {
      switch (event.type) {
        case 'session_context_ready':
          debugLiveJourney('session_context_ready', {
            session_id: event.session_id,
            mode: event.mode,
          });
          setPhase(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');
          break;
        case 'connected':
          break;
        case 'audio':
          if (!handshakeCompleteRef.current) {
            pendingAudioRef.current.push({
              data: event.data,
              sample_rate: event.sample_rate ?? 24000,
            });
            break;
          }
          enqueueLiveAudio(event.data, event.sample_rate ?? 24000);
          break;
        case 'input_transcription':
          updateTranscription('user', event.text, event.finished);
          break;
        case 'output_transcription':
          updateTranscription('assistant', event.text, event.finished);
          break;
        case 'turn_complete':
          getPlayer().finishTurn();
          break;
        case 'interrupted':
          getPlayer().clear();
          setIsModelSpeaking(false);
          setTranscriptChunks((current) =>
            current.map((chunk) => (chunk.isFinal ? chunk : { ...chunk, isFinal: true })),
          );
          break;
        case 'delegation_started':
          debugLiveJourney('delegation_started', { turn_id: event.turn_id });
          void openDelegationStream(event.turn_id);
          break;
        case 'simple_explanation':
          onLiveGuideSpeechRef.current?.(event.text);
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
          resumeAfterGoAwayRef.current = true;
          setPhase('reconnecting');
          break;
        case 'error':
          setError(event.message);
          setPhase('error');
          intentionalCloseRef.current = true;
          reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
          closeWebSocket();
          break;
        case 'reconnecting':
          setPhase('reconnecting');
          break;
        default:
          break;
      }
    },
    [closeWebSocket, enqueueLiveAudio, getPlayer, openDelegationStream, updateTranscription],
  );

  const finishConnectedHandshake = useCallback(
    async (event: Extract<LiveClientEvent, { type: 'connected' }>) => {
      debugLiveJourney('connected', { session_id: event.session_id, mode: event.mode });

      const mediaStream = pendingMediaStreamRef.current;
      if (!mediaStream) {
        throw new Error('Microphone is not available.');
      }

      await startMicCapture(mediaStream);

      handshakeCompleteRef.current = true;
      drainPendingAudio();

      hadStableLiveSessionRef.current = true;
      reconnectAttemptsRef.current = 0;
      resumeAfterGoAwayRef.current = false;
      setPhase('live');

      if (event.pending_turn_id) {
        void openDelegationStream(event.pending_turn_id);
      }
      startFrameTimer();
    },
    [drainPendingAudio, openDelegationStream, startFrameTimer, startMicCapture],
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
    try {
      await getPlayer().initialize();
    } catch (playerError) {
      const message =
        playerError instanceof Error ? playerError.message : 'Could not initialize Live audio.';
      return { ok: false, error: message };
    }

    const isResumptionReconnect =
      reconnectAttemptsRef.current > 0 && resumeAfterGoAwayRef.current;
    if (!isResumptionReconnect) {
      clearResumptionHandle();
      clearStoredSessionId();
    }

    const sessionId = getOrCreateSessionId();
    const userId = liveUserId(astraKey);
    const wsUrl = `${baseUrl.replace(/\/$/, '')}/ws/${encodeURIComponent(userId)}/${encodeURIComponent(sessionId)}`;
    const resumptionHandle = isResumptionReconnect ? getStoredResumptionHandle() : null;

    pendingMediaStreamRef.current = mediaStream;

    handshakeCompleteRef.current = false;
    pendingAudioRef.current = [];
    getPlayer().clear();
    setTranscriptChunks([]);

    intentionalCloseRef.current = false;
    hadStableLiveSessionRef.current = false;
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
      let connectedReceived = false;
      let settled = false;

      const settle = (result: ConnectResult) => {
        if (settled) return;
        settled = true;
        if (connectTimeoutRef.current !== null) {
          window.clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        resolve(result);
      };

      connectTimeoutRef.current = window.setTimeout(() => {
        if (connectedReceived) return;
        intentionalCloseRef.current = true;
        setError('Live connection timed out.');
        setPhase('error');
        ws.close();
        settle({ ok: false, error: 'Live connection timed out.' });
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'init',
            astra_key: astraKey,
            mode,
            companion_profile: companionProfile,
            user_context: userContext,
            resumption_handle: resumptionHandle,
          }),
        );
      };

      ws.onmessage = (message) => {
        if (typeof message.data !== 'string') return;
        try {
          const event = JSON.parse(message.data) as LiveClientEvent;
          if (event.type === 'connected') {
            void (async () => {
              try {
                await finishConnectedHandshake(event);
                connectedReceived = true;
                settle({ ok: true });
              } catch (connectError) {
                const connectMessage =
                  connectError instanceof Error
                    ? connectError.message
                    : 'Could not start microphone capture.';
                setError(connectMessage);
                setPhase('error');
                intentionalCloseRef.current = true;
                reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
                closeWebSocket();
                settle({ ok: false, error: connectMessage });
              }
            })();
            return;
          }

          handleClientEvent(event);
          if (event.type === 'error') {
            settle({ ok: false, error: event.message });
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
        settle({ ok: false, error: 'Live connection failed.' });
      };

      ws.onclose = () => {
        wsRef.current = null;
        pendingMediaStreamRef.current = null;
        stopPcmCapture();
        stopFrameTimer();
        getPlayer().clear();
        setIsModelSpeaking(false);

        if (intentionalCloseRef.current) {
          return;
        }

        if (!hadStableLiveSessionRef.current) {
          setError((current) => current ?? 'Live connection failed.');
          setPhase('error');
          return;
        }

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError('Could not reconnect to Live.');
          setPhase('error');
          return;
        }

        reconnectAttemptsRef.current += 1;
        hadStableLiveSessionRef.current = false;
        setPhase('reconnecting');
        reconnectTimerRef.current = window.setTimeout(() => {
          void openWebSocketRef.current?.();
        }, RECONNECT_DELAY_MS);
      };
    });
  }, [
    closeWebSocket,
    finishConnectedHandshake,
    getPlayer,
    handleClientEvent,
    stopFrameTimer,
    stopPcmCapture,
    stream,
  ]);
  useEffect(() => {
    openWebSocketRef.current = openWebSocket;
  }, [openWebSocket]);

  const connect = useCallback(async (): Promise<ConnectResult> => {
    if (!enabled) {
      return { ok: false, error: 'Live session is not enabled.' };
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return { ok: true };
    }
    return openWebSocket();
  }, [enabled, openWebSocket]);

  const prepareAudio = useCallback(() => getPlayer().initialize(), [getPlayer]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    reconnectAttemptsRef.current = 0;
    hadStableLiveSessionRef.current = false;
    resumeAfterGoAwayRef.current = false;
    pendingMediaStreamRef.current = null;
    handshakeCompleteRef.current = false;
    pendingAudioRef.current = [];
    clearResumptionHandle();
    stopDelegationStream();
    closeWebSocket();
    stopPcmCapture();
    stopFrameTimer();
    getPlayer().clear();
    setIsModelSpeaking(false);
    setTranscriptChunks([]);
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
    const onPageHide = () => {
      intentionalCloseRef.current = true;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };

    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

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
    transcriptChunks,
    error,
    prepareAudio,
    connect,
    disconnect,
    dismissExplanation,
    reset,
    sendMonitorTurn: sendVisualOverSocket,
    sendBootstrapTurn: sendVisualOverSocket,
  };
}
