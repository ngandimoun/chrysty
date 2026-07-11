'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalAudioTrack } from 'livekit-client';

import { VoiceControls } from '@/components/astra/voice-controls';
import { useGeminiLive } from '@/hooks/use-gemini-live';
import type { VisualCapture } from '@/hooks/use-voice-agent';
import { toAuraStateFromLive, type AppAgentPhase } from '@/lib/agent-state';
import {
  acquireLocalAudioTrack,
  releaseLocalAudioTrack,
} from '@/lib/audio/mic';
import { primeAudioForVoiceSession } from '@/lib/audio/audio-context';
import type { AgentState } from '@/hooks/use-voice-agent';
import {
  EMBED_MESSAGE,
  isAllowedEmbedParentOrigin,
  parseHostReadyPayload,
  resolveParentOrigin,
  screenCaptureToVisualCapture,
} from '@/lib/embed/post-message-bridge';
import { isGeminiLiveEnabled } from '@/lib/gemini/config';
import type { LiveGuideUpdate } from '@/lib/streaming/types';
import { createWorkspaceUiContext } from '@/lib/live/workspace-context';
import type { WorkspaceUiContext } from '@/lib/live/workspace-context';

const AuraVisualizer = dynamic(
  () => import('@/components/astra/aura-visualizer').then((mod) => mod.AuraVisualizer),
  {
    ssr: false,
    loading: () => (
      <div className="size-48 max-w-[min(70vw,16rem)] animate-pulse rounded-full bg-primary/10" />
    ),
  },
);

const geminiLiveEnabled = isGeminiLiveEnabled();

function postToParent(type: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || window.parent === window) return;
  const origin = resolveParentOrigin();
  if (!origin || !isAllowedEmbedParentOrigin(origin)) return;
  window.parent.postMessage({ type, ...payload }, origin);
}

export function EmbedLiveShell() {
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const hostCaptureRef = useRef<VisualCapture | null>(null);
  const workspaceContextRef = useRef<WorkspaceUiContext | null>(null);
  const parentOriginRef = useRef<string | null>(null);

  const getAudioStream = useCallback(() => audioTrackRef.current?.mediaStream ?? null, []);

  const getVisualCapture = useCallback(async (): Promise<VisualCapture[]> => {
    const capture = hostCaptureRef.current;
    return capture ? [capture] : [];
  }, []);

  const getLiveCameraFrame = useCallback(async (): Promise<VisualCapture | null> => {
    return hostCaptureRef.current;
  }, []);

  const handleLiveGuide = useCallback((update: LiveGuideUpdate) => {
    const guide = update.liveGuide;
    if (!guide?.directives?.length) return;
    postToParent(EMBED_MESSAGE.LIVE_GUIDE, {
      directives: guide.directives,
      clearPrevious: guide.clear_previous ?? false,
      coachingNote: guide.coaching_note ?? null,
    });
  }, []);

  const {
    phase: livePhase,
    isModelSpeaking,
    isSpeaking: liveIsSpeaking,
    explanation,
    error: liveError,
    prepareAudio,
    connect: connectLive,
    disconnect: disconnectLive,
    dismissExplanation,
    updateWorkspaceContext,
  } = useGeminiLive({
    stream: audioTrack?.mediaStream,
    getStream: getAudioStream,
    enabled: geminiLiveEnabled,
    getVisualCapture,
    getLiveCameraFrame,
    onLiveGuide: handleLiveGuide,
  });

  const displayPhase = toAuraStateFromLive(livePhase, isModelSpeaking);
  const isSessionConnected = livePhase !== 'idle' && livePhase !== 'error';
  const voiceAgentState: AgentState =
    livePhase === 'connecting' || livePhase === 'reconnecting' ? 'processing' : 'idle';

  const applyHostPayload = useCallback(
    (payload: Record<string, unknown>) => {
      const parsed = parseHostReadyPayload(payload);
      if (!parsed) return;

      if (parsed.capture) {
        hostCaptureRef.current = screenCaptureToVisualCapture(parsed.capture);
      }

      const uiContext = createWorkspaceUiContext({
        source: 'explanation_canvas',
        title: parsed.title,
        selectedPassage: parsed.selectedPassage,
        fullText: parsed.nearbyExcerpt,
        saved: false,
        artifactLanguage: parsed.artifactLanguage,
      });
      workspaceContextRef.current = uiContext;
      void updateWorkspaceContext(uiContext);
    },
    [updateWorkspaceContext],
  );

  useEffect(() => {
    parentOriginRef.current = resolveParentOrigin();
    postToParent(EMBED_MESSAGE.EMBED_READY);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isAllowedEmbedParentOrigin(event.origin)) return;
      parentOriginRef.current = event.origin;
      const data = event.data;
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

      if (
        data.type === EMBED_MESSAGE.HOST_READY ||
        data.type === EMBED_MESSAGE.CONTEXT_UPDATE ||
        data.type === EMBED_MESSAGE.CAPTURE_UPDATE
      ) {
        applyHostPayload(data as Record<string, unknown>);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [applyHostPayload]);

  useEffect(() => {
    if (livePhase === 'live') {
      postToParent(EMBED_MESSAGE.CONNECTED);
    }
  }, [livePhase]);

  useEffect(() => {
    if (livePhase !== 'live') return;
    postToParent(EMBED_MESSAGE.SPEAKING, { speaking: isModelSpeaking });
  }, [isModelSpeaking, livePhase]);

  useEffect(() => {
    if (livePhase === 'live' && workspaceContextRef.current) {
      void updateWorkspaceContext(workspaceContextRef.current);
    }
  }, [livePhase, updateWorkspaceContext]);

  const teardownMic = useCallback(() => {
    releaseLocalAudioTrack(audioTrackRef.current);
    audioTrackRef.current = null;
    setAudioTrack(null);
  }, []);

  const ensureLiveMic = useCallback(async () => {
    primeAudioForVoiceSession();
    if (audioTrackRef.current) return;
    const track = await acquireLocalAudioTrack();
    audioTrackRef.current = track;
    setAudioTrack(track);
  }, []);

  const handleConnect = useCallback(async () => {
    await prepareAudio();
    await ensureLiveMic();
    const result = await connectLive();
    if (!result.ok) {
      teardownMic();
    }
    return result;
  }, [connectLive, ensureLiveMic, prepareAudio, teardownMic]);

  const handleDisconnect = useCallback(() => {
    disconnectLive();
    teardownMic();
    hostCaptureRef.current = null;
    workspaceContextRef.current = null;
    postToParent(EMBED_MESSAGE.CLOSED);
  }, [disconnectLive, teardownMic]);

  const handleToggleRecording = useCallback(async () => {
    if (!isSessionConnected) {
      await handleConnect();
      return;
    }
  }, [handleConnect, isSessionConnected]);

  if (!geminiLiveEnabled) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <p>Chrysty Live is not enabled on this deployment.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-between bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4">
        {liveError ? (
          <p className="text-center text-sm text-destructive" role="alert">
            {liveError}
          </p>
        ) : null}
        <AuraVisualizer phase={displayPhase as AppAgentPhase} audioTrack={audioTrack} />
        {explanation.active && explanation.fullText ? (
          <div className="max-h-32 w-full overflow-y-auto rounded-xl border border-border bg-muted/40 p-3 text-xs text-foreground">
            <p className="line-clamp-6 whitespace-pre-wrap">{explanation.fullText}</p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-primary"
              onClick={dismissExplanation}
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <footer className="flex w-full max-w-md flex-col items-center gap-3">
        <VoiceControls
          phase={displayPhase}
          isBusy={livePhase === 'connecting' || livePhase === 'reconnecting'}
          liveMode
          agentState={voiceAgentState}
          cameraActive={false}
          onDisconnect={handleDisconnect}
          onToggleCamera={() => {}}
          onToggleRecording={() => void handleToggleRecording()}
          onCancelRecording={() => {}}
          onOpenDocuments={() => {}}
        />
      </footer>
    </div>
  );
}
