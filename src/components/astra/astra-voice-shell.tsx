'use client';

import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { LocalAudioTrack } from 'livekit-client';

import { AudioErrorBanner } from '@/components/astra/audio-error-banner';
import { BackgroundJobsPill } from '@/components/astra/background-jobs-pill';
import { BackgroundJobsSheet } from '@/components/astra/background-jobs-sheet';
import { ConnectedUserBadge } from '@/components/auth/connected-user-badge';
import { DocumentsSheet } from '@/components/astra/documents-sheet';
import { ListeningAmbientBackground } from '@/components/astra/listening-ambient-background';
import { PhotoAnnotationEditor } from '@/components/astra/photo-annotation-editor';
import { PhotoStrip, type PhotoStripItem } from '@/components/astra/photo-strip';
import { StatusLabel } from '@/components/astra/status-label';
import { VisualizerSlot } from '@/components/astra/visualizer-slot';
import { VoiceControls } from '@/components/astra/voice-controls';
import { useBackgroundJobs } from '@/hooks/use-background-jobs';
import { useCamera } from '@/hooks/use-camera';
import { useGeneratedDocuments } from '@/hooks/use-generated-documents';
import { useVoiceAgent, type VisualCapture } from '@/hooks/use-voice-agent';
import type { AppAgentPhase } from '@/lib/agent-state';
import {
  acquireLocalAudioTrack,
  getInsecureContextMessage,
  isSecureMicContext,
  MicError,
  releaseLocalAudioTrack,
} from '@/lib/audio/mic';
import {
  primeAudioForVoiceSession,
  resetAudioSession,
  unlockSharedAudioContextSync,
} from '@/lib/audio/audio-context';
import { mapObjectCoverAnnotationsToImage } from '@/lib/camera/annotation-coordinates';
import { burnFocusAnnotations } from '@/lib/camera/annotate';
import { CameraError, type CameraAspectRatio, type FocusAnnotation } from '@/lib/camera/types';
import { hasSavableExplanationContent } from '@/lib/documents/save-explanation-artifacts';
import { isPerceptionEnabled, PerceptionManager } from '@/lib/perception/manager';

const showTranscript = process.env.NEXT_PUBLIC_SHOW_TRANSCRIPT === 'true';

const TranscriptSlot = showTranscript
  ? dynamic(() => import('@/components/astra/transcript-slot').then((mod) => mod.TranscriptSlot), {
      ssr: false,
    })
  : null;

function hasLiveAudioInput(track: LocalAudioTrack | null): boolean {
  const stream = track?.mediaStream;
  return Boolean(stream?.getAudioTracks().some((mediaTrack) => mediaTrack.readyState === 'live'));
}

export function AstraVoiceShell() {
  const [phase, setPhase] = useState<AppAgentPhase>('idle');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<MicError['code'] | undefined>();
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | null>(null);
  const [photoStripItems, setPhotoStripItems] = useState<PhotoStripItem[]>([]);
  const [liveFocusAnnotations, setLiveFocusAnnotations] = useState<FocusAnnotation[]>([]);
  const [selectedAnnotationPhotoId, setSelectedAnnotationPhotoId] = useState<string | null>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSavingExplanation, setIsSavingExplanation] = useState(false);

  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveFocusAnnotationsRef = useRef<FocusAnnotation[]>([]);
  const cameraFacingRef = useRef<'environment' | 'user'>('environment');
  const photoUrlsRef = useRef<Map<string, { url: string; source: Blob }>>(new Map());
  const perceptionManagerRef = useRef<PerceptionManager | null>(null);
  const suspendSessionRef = useRef<() => void>(() => {});

  const isInsecureContext = !useSyncExternalStore(
    () => () => {},
    isSecureMicContext,
    () => true,
  );
  const insecureContextMessage = isInsecureContext ? getInsecureContextMessage() : null;

  const isConnected = phase !== 'idle' && phase !== 'error';

  const {
    stream: cameraStream,
    isActive: cameraActive,
    facing: cameraFacing,
    aspectRatio: cameraAspectRatio,
    canFlip: canFlipCamera,
    torchOn,
    canUseTorch,
    zoom,
    zoomRange,
    canZoom,
    exposureCompensation,
    exposureRange,
    canAdjustExposure,
    canFocusAtPoint,
    pendingPhotos,
    openCamera,
    closeCamera,
    toggleSelfie,
    toggleTorch,
    setZoom,
    setExposureCompensation,
    setAspectRatio,
    focusAtPoint,
    takePhoto,
    updatePendingPhoto,
    removePendingPhoto,
    clearPendingPhotos,
    startFrameSampling,
    stopFrameSamplingAndPickBest,
    cancelFrameSampling,
    consumePendingPhotos,
  } = useCamera();

  useEffect(() => {
    liveFocusAnnotationsRef.current = liveFocusAnnotations;
  }, [liveFocusAnnotations]);

  useEffect(() => {
    cameraFacingRef.current = cameraFacing;
  }, [cameraFacing]);

  const handleLiveFocusAnnotationsChange = useCallback((annotations: FocusAnnotation[]) => {
    liveFocusAnnotationsRef.current = annotations;
    setLiveFocusAnnotations(annotations);
  }, []);

  const clearLiveFocusAnnotations = useCallback(() => {
    handleLiveFocusAnnotationsChange([]);
  }, [handleLiveFocusAnnotationsChange]);

  const stopPerception = useCallback(() => {
    perceptionManagerRef.current?.stop();
    perceptionManagerRef.current = null;
  }, []);

  const getPerceptionSnapshot = useCallback(() => {
    return perceptionManagerRef.current?.snapshot();
  }, []);

  const getImageSpaceLiveFocusAnnotations = useCallback((): FocusAnnotation[] => {
    const annotations = liveFocusAnnotationsRef.current;
    const video = cameraVideoRef.current;
    if (annotations.length === 0 || !video || video.videoWidth === 0 || video.videoHeight === 0) {
      return [];
    }

    const bounds = video.getBoundingClientRect();
    return mapObjectCoverAnnotationsToImage(
      annotations,
      { width: bounds.width, height: bounds.height },
      { width: video.videoWidth, height: video.videoHeight },
      cameraFacingRef.current === 'user',
    );
  }, []);

  const handleSpeakingStart = useCallback(() => {
    setPhase('speaking');
  }, []);

  const handleSpeakingEnd = useCallback(() => {
    setPhase((current) => (current === 'speaking' ? 'listening' : current));
  }, []);

  const handleRecordingStart = useCallback(() => {
    if (cameraActive && cameraVideoRef.current) {
      startFrameSampling(cameraVideoRef.current);
    }
  }, [cameraActive, startFrameSampling]);

  const getVisualCapture = useCallback(async (): Promise<VisualCapture[]> => {
    const perception = getPerceptionSnapshot();
    const pending = consumePendingPhotos();
    if (pending.length > 0) {
      clearLiveFocusAnnotations();
      return pending.map((photo) => ({
        blob: photo.annotatedBlob ?? photo.blob,
        mimeType: photo.mimeType,
        captureMode: photo.mode,
        width: photo.width,
        height: photo.height,
        focusAnnotations: photo.focusAnnotations,
        ...(perception ? { perception } : {}),
      }));
    }

    if (!cameraActive) return [];

    const bestFrame = await stopFrameSamplingAndPickBest();
    if (!bestFrame) return [];

    const focusAnnotations = getImageSpaceLiveFocusAnnotations();
    if (focusAnnotations.length > 0) {
      const annotated = await burnFocusAnnotations(bestFrame.blob, focusAnnotations);
      clearLiveFocusAnnotations();
      return [
        {
          blob: annotated.blob,
          mimeType: bestFrame.mimeType,
          captureMode: 'smart_snapshot',
          width: bestFrame.width,
          height: bestFrame.height,
          focusAnnotations,
          ...(perception ? { perception } : {}),
        },
      ];
    }

    clearLiveFocusAnnotations();
    return [
      {
        blob: bestFrame.blob,
        mimeType: bestFrame.mimeType,
        captureMode: 'smart_snapshot',
        width: bestFrame.width,
        height: bestFrame.height,
        ...(perception ? { perception } : {}),
      },
    ];
  }, [
    cameraActive,
    clearLiveFocusAnnotations,
    consumePendingPhotos,
    getImageSpaceLiveFocusAnnotations,
    getPerceptionSnapshot,
    stopFrameSamplingAndPickBest,
  ]);

  const {
    documents,
    unreadCount: unreadDocumentCount,
    isLoading: documentsLoading,
    error: documentsError,
    saveFromExplanation,
    saveAudio,
    markRead: markDocumentRead,
    update: updateDocument,
    copyDocumentText,
    remove: removeDocument,
    refresh: refreshDocuments,
    getDocument,
  } = useGeneratedDocuments();

  const handleJobCompleted = useCallback(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  const {
    jobs: backgroundJobs,
    activeJobs: activeBackgroundJobs,
    unseenCompleted: unseenCompletedJobs,
    cancelJob: cancelBackgroundJob,
    markCompletedSeen: markJobsSeen,
    refresh: refreshBackgroundJobs,
  } = useBackgroundJobs({ onJobCompleted: handleJobCompleted });

  const handleOpenJobs = useCallback(() => {
    setJobsOpen(true);
    void refreshBackgroundJobs();
  }, [refreshBackgroundJobs]);

  const handleJobsOpenChange = useCallback(
    (open: boolean) => {
      setJobsOpen(open);
      if (!open) {
        void markJobsSeen();
      }
    },
    [markJobsSeen],
  );

  const handleCancelBackgroundJob = useCallback(
    (id: string) => {
      void cancelBackgroundJob(id).catch(() => {});
    },
    [cancelBackgroundJob],
  );

  const handleViewJobDocuments = useCallback(() => {
    setJobsOpen(false);
    void markJobsSeen();
    void refreshDocuments();
    setDocumentsOpen(true);
  }, [markJobsSeen, refreshDocuments]);

  const selectedDocument = selectedDocumentId ? getDocument(selectedDocumentId) : null;

  const getAudioStream = useCallback(() => audioTrackRef.current?.mediaStream ?? null, []);

  const {
    state: agentState,
    explanation,
    timings,
    playbackBlocked,
    lastResponseAudio,
    toggleRecording,
    cancelRecording,
    stopSpeaking,
    replayLastResponseAudio,
    dismissExplanation,
    clearLastResponseAudio,
    reset: resetAgent,
  } = useVoiceAgent({
    stream: audioTrack?.mediaStream,
    getStream: getAudioStream,
    enabled: isConnected,
    onSpeakingStart: handleSpeakingStart,
    onSpeakingEnd: handleSpeakingEnd,
    onRecordingStart: handleRecordingStart,
    getVisualCapture,
  });

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setErrorCode(undefined);
  }, []);

  const teardownMic = useCallback(() => {
    releaseLocalAudioTrack(audioTrackRef.current);
    audioTrackRef.current = null;
    setAudioTrack(null);
  }, []);

  const ensureLiveMic = useCallback(async () => {
    primeAudioForVoiceSession();
    unlockSharedAudioContextSync('play-and-record');

    if (hasLiveAudioInput(audioTrackRef.current)) {
      return true;
    }

    teardownMic();

    try {
      const track = await acquireLocalAudioTrack();
      audioTrackRef.current = track;
      setAudioTrack(track);
      return true;
    } catch (error) {
      const micError = error instanceof MicError ? error : new MicError('unknown', 'Could not start session.');
      setErrorMessage(micError.message);
      setErrorCode(micError.code);
      setPhase('error');
      return false;
    }
  }, [teardownMic]);

  const handleDisconnect = useCallback(() => {
    teardownMic();
    stopPerception();
    closeCamera();
    clearLiveFocusAnnotations();
    clearPendingPhotos();
    stopSpeaking();
    resetAgent();
    resetAudioSession();
    setPhase('idle');
    setSelectedAnnotationPhotoId(null);
    setSelectedDocumentId(null);
    setSaveMessage(null);
    setIsSavingExplanation(false);
    clearError();
  }, [
    clearError,
    clearLiveFocusAnnotations,
    clearPendingPhotos,
    closeCamera,
    resetAgent,
    stopSpeaking,
    stopPerception,
    teardownMic,
  ]);

  const suspendSession = useCallback(() => {
    if (agentState === 'recording') {
      return;
    }

    teardownMic();
    stopPerception();
    closeCamera();
    cancelFrameSampling();
    stopSpeaking();
    setIsBusy(false);
    setPhase('idle');
  }, [
    cancelFrameSampling,
    agentState,
    closeCamera,
    stopPerception,
    stopSpeaking,
    teardownMic,
  ]);

  useEffect(() => {
    suspendSessionRef.current = suspendSession;
  }, [suspendSession]);

  const handleToggleCamera = useCallback(async () => {
    if (!isConnected || isBusy) return;

    clearError();
    setIsBusy(true);

    try {
      if (cameraActive) {
        stopPerception();
        closeCamera();
        clearLiveFocusAnnotations();
        return;
      }

      await openCamera();
    } catch (error) {
      const cameraError =
        error instanceof CameraError ? error : new CameraError('unknown', 'Could not open camera.');
      setErrorMessage(cameraError.message);
      setErrorCode(cameraError.code === 'insecure-context' ? 'insecure-context' : 'unknown');
      if (cameraError.code === 'permission-denied') {
        setErrorCode('permission-denied');
      }
    } finally {
      setIsBusy(false);
    }
  }, [
    cameraActive,
    clearError,
    clearLiveFocusAnnotations,
    closeCamera,
    isBusy,
    isConnected,
    openCamera,
    stopPerception,
  ]);

  const handleFlipCamera = useCallback(async () => {
    if (!cameraActive || isBusy) return;

    setIsBusy(true);
    clearError();

    try {
      await toggleSelfie();
      clearLiveFocusAnnotations();
    } catch (error) {
      const cameraError =
        error instanceof CameraError ? error : new CameraError('unknown', 'Could not switch camera.');
      setErrorMessage(cameraError.message);
    } finally {
      setIsBusy(false);
    }
  }, [cameraActive, clearError, clearLiveFocusAnnotations, isBusy, toggleSelfie]);

  const handleToggleTorch = useCallback(async () => {
    if (!cameraActive || isBusy) return;

    setIsBusy(true);
    clearError();

    try {
      await toggleTorch();
    } catch (error) {
      const cameraError =
        error instanceof CameraError
          ? error
          : new CameraError('not-supported', 'Flashlight is not available on this device.');
      setErrorMessage(cameraError.message);
    } finally {
      setIsBusy(false);
    }
  }, [cameraActive, clearError, isBusy, toggleTorch]);

  const handleZoomChange = useCallback(
    async (value: number) => {
      if (!cameraActive) return;

      try {
        await setZoom(value);
      } catch {
        // Ignore unsupported zoom gestures on this device.
      }
    },
    [cameraActive, setZoom],
  );

  const handleExposureChange = useCallback(
    async (value: number) => {
      if (!cameraActive || isBusy) return;

      try {
        await setExposureCompensation(value);
      } catch (error) {
        const cameraError =
          error instanceof CameraError
            ? error
            : new CameraError('not-supported', 'Exposure adjustment is not available on this device.');
        setErrorMessage(cameraError.message);
      }
    },
    [cameraActive, isBusy, setExposureCompensation],
  );

  const handleAspectRatioChange = useCallback(
    async (ratio: CameraAspectRatio) => {
      if (!cameraActive || isBusy) return;

      setIsBusy(true);
      clearError();

      try {
        await setAspectRatio(ratio);
        clearLiveFocusAnnotations();
      } catch (error) {
        const cameraError =
          error instanceof CameraError
            ? error
            : new CameraError('unknown', 'Could not change aspect ratio.');
        setErrorMessage(cameraError.message);
      } finally {
        setIsBusy(false);
      }
    },
    [cameraActive, clearError, clearLiveFocusAnnotations, isBusy, setAspectRatio],
  );

  const handleFocusAtPoint = useCallback(
    async (x: number, y: number) => {
      if (!cameraActive) return;
      await focusAtPoint(x, y);
    },
    [cameraActive, focusAtPoint],
  );

  const handleTakePhoto = useCallback(async () => {
    if (!cameraActive || isBusy) return;

    setIsBusy(true);
    clearError();

    try {
      const focusAnnotations = getImageSpaceLiveFocusAnnotations();
      await takePhoto(focusAnnotations);
      clearLiveFocusAnnotations();
    } catch (error) {
      const cameraError =
        error instanceof CameraError ? error : new CameraError('unknown', 'Could not capture photo.');
      setErrorMessage(cameraError.message);
    } finally {
      setIsBusy(false);
    }
  }, [
    cameraActive,
    clearError,
    clearLiveFocusAnnotations,
    getImageSpaceLiveFocusAnnotations,
    isBusy,
    takePhoto,
  ]);

  const handleSaveAnnotation = useCallback(
    (photoId: string, annotations: FocusAnnotation[], annotatedBlob?: Blob) => {
      updatePendingPhoto(photoId, {
        focusAnnotations: annotations,
        annotatedBlob,
      });
    },
    [updatePendingPhoto],
  );

  const handleRemovePendingPhoto = useCallback(
    (id: string) => {
      if (selectedAnnotationPhotoId === id) {
        setSelectedAnnotationPhotoId(null);
      }
      removePendingPhoto(id);
    },
    [removePendingPhoto, selectedAnnotationPhotoId],
  );

  const handleToggleRecording = useCallback(async () => {
    if (isBusy || agentState === 'processing') return;

    const wasRecording = agentState === 'recording';
    clearError();

    if (!wasRecording) {
      setIsBusy(true);
      setPhase('connecting');
      let micReady = false;
      try {
        micReady = await ensureLiveMic();
      } finally {
        setIsBusy(false);
      }
      if (!micReady) return;
      setPhase('listening');
    }

    if (wasRecording) {
      setPhase('thinking');
    }

    const result = await toggleRecording();

    if (!result.ok) {
      setErrorMessage(result.error ?? (wasRecording ? 'Could not generate a response.' : 'Could not start recording.'));
      setErrorCode(undefined);
      setPhase('error');
      return;
    }

    if (wasRecording) {
      setPhase((current) => (current === 'thinking' ? 'listening' : current));
      // A voice turn may have delegated a new background job — pick it up quickly.
      void refreshBackgroundJobs();
    } else {
      setPhase('listening');
    }
  }, [agentState, clearError, ensureLiveMic, isBusy, refreshBackgroundJobs, toggleRecording]);

  const handleCancelRecording = useCallback(async () => {
    if (agentState !== 'recording') return;
    cancelFrameSampling();
    await cancelRecording();
  }, [agentState, cancelFrameSampling, cancelRecording]);

  const handleSaveExplanation = useCallback(async () => {
    if (isSavingExplanation || explanation.isStreaming || !hasSavableExplanationContent(explanation)) return;

    setIsSavingExplanation(true);
    setSaveMessage('Saving...');
    try {
      const count = await saveFromExplanation(explanation);
      setSaveMessage(count > 0 ? `Saved ${count} item${count === 1 ? '' : 's'}` : 'Nothing to save');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save';
      setSaveMessage(message);
    } finally {
      setIsSavingExplanation(false);
    }
  }, [explanation, isSavingExplanation, saveFromExplanation]);

  const handleSaveAudio = useCallback(async () => {
    if (!lastResponseAudio) return;

    try {
      await saveAudio(lastResponseAudio.pcm, lastResponseAudio.sampleRate);
      clearLastResponseAudio();
      setSaveMessage('Audio saved');
    } catch {
      setSaveMessage('Could not save audio');
    }
  }, [clearLastResponseAudio, lastResponseAudio, saveAudio]);

  const handleUpdateDocument = useCallback(
    async (id: string, patch: { title?: string; fullText?: string }) => {
      await updateDocument(id, patch);
    },
    [updateDocument],
  );

  const handleRemoveDocument = useCallback(
    async (id: string) => {
      await removeDocument(id);
      if (selectedDocumentId === id) {
        setSelectedDocumentId(null);
      }
    },
    [removeDocument, selectedDocumentId],
  );

  const handleSelectDocument = useCallback(
    (id: string) => {
      setSelectedDocumentId(id);
      void markDocumentRead(id);
    },
    [markDocumentRead],
  );

  useEffect(() => {
    if (!saveMessage || isSavingExplanation) return;
    const timer = window.setTimeout(() => setSaveMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [isSavingExplanation, saveMessage]);

  const canSaveExplanation =
    explanation.active &&
    !explanation.isStreaming &&
    hasSavableExplanationContent(explanation);

  const showSaveAudio =
    lastResponseAudio !== null &&
    lastResponseAudio.pcm.length > 0 &&
    !explanation.isStreaming;

  const handleCameraVideoReady = useCallback(
    (video: HTMLVideoElement) => {
      cameraVideoRef.current = video;
      if (isPerceptionEnabled()) {
        if (!perceptionManagerRef.current) {
          perceptionManagerRef.current = new PerceptionManager({ profile: 'general' });
        }
        perceptionManagerRef.current.start(video);
      }
      if (agentState === 'recording') {
        startFrameSampling(video);
      }
    },
    [agentState, startFrameSampling],
  );

  const selectedAnnotationPhoto =
    selectedAnnotationPhotoId !== null
      ? pendingPhotos.find((photo) => photo.id === selectedAnnotationPhotoId) ?? null
      : null;

  useEffect(() => {
    const currentIds = new Set(pendingPhotos.map((photo) => photo.id));
    const map = photoUrlsRef.current;

    for (const [id, entry] of map) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(entry.url);
        map.delete(id);
      }
    }

    for (const photo of pendingPhotos) {
      const source = photo.annotatedBlob ?? photo.blob;
      const current = map.get(photo.id);
      if (!current || current.source !== source) {
        if (current) {
          URL.revokeObjectURL(current.url);
        }
        map.set(photo.id, { url: URL.createObjectURL(source), source });
      }
    }

    setPhotoStripItems(
      pendingPhotos.map((photo) => ({
        id: photo.id,
        url: map.get(photo.id)!.url,
        annotationCount: photo.focusAnnotations.length > 0 ? photo.focusAnnotations.length : undefined,
      })),
    );
  }, [pendingPhotos]);

  useEffect(() => {
    const urlMap = photoUrlsRef.current;
    return () => {
      for (const entry of urlMap.values()) {
        URL.revokeObjectURL(entry.url);
      }
      urlMap.clear();
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        suspendSessionRef.current();
      }
    };

    const onPageHide = () => {
      suspendSessionRef.current();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      suspendSessionRef.current();
    };
  }, []);

  const isListening = phase === 'listening';

  return (
    <main
      className={`relative flex min-h-dvh flex-col items-center justify-between overflow-x-hidden bg-background px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]`}
    >
      <AnimatePresence mode="wait">
        {isListening ? (
          <motion.div
            key="listening-ambient"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0"
          >
            <ListeningAmbientBackground />
          </motion.div>
        ) : (
          <motion.div
            key="default-ambient"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 hidden dark:block bg-[radial-gradient(circle_at_50%_20%,rgba(31,213,249,0.12),transparent_55%)]"
          />
        )}
      </AnimatePresence>

      <header className="relative z-10 grid w-full grid-cols-[1fr_auto_1fr] items-center">
        <div />
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">Chrysty</p>
        <div className="flex justify-end">
          <ConnectedUserBadge />
        </div>
      </header>

      <section className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 sm:gap-6">
        <VisualizerSlot
          phase={phase}
          audioTrack={audioTrack}
          explanation={explanation}
          selectedDocument={selectedDocument}
          speakingDurationMs={timings?.ttsMs ?? null}
          cameraStream={cameraStream}
          cameraFacing={cameraFacing}
          cameraAspectRatio={cameraAspectRatio}
          onCameraVideoReady={handleCameraVideoReady}
          onDismissExplanation={dismissExplanation}
          onDismissDocument={() => setSelectedDocumentId(null)}
          onUpdateDocument={handleUpdateDocument}
          onCopyDocument={copyDocumentText}
          onSaveExplanation={canSaveExplanation ? handleSaveExplanation : undefined}
          saveExplanationDisabled={explanation.isStreaming || isSavingExplanation}
          isSavingExplanation={isSavingExplanation}
          pendingPhotoCount={pendingPhotos.length}
          canFlipCamera={canFlipCamera}
          canUseTorch={canUseTorch}
          torchOn={torchOn}
          zoom={zoom}
          zoomRange={zoomRange}
          canZoom={canZoom}
          exposureCompensation={exposureCompensation}
          exposureRange={exposureRange}
          canAdjustExposure={canAdjustExposure}
          canFocusAtPoint={canFocusAtPoint}
          cameraControlsDisabled={isBusy || agentState === 'processing' || phase === 'thinking'}
          focusAnnotations={liveFocusAnnotations}
          onTakePhoto={handleTakePhoto}
          onFlipCamera={handleFlipCamera}
          onToggleTorch={handleToggleTorch}
          onZoomChange={handleZoomChange}
          onExposureChange={handleExposureChange}
          onAspectRatioChange={handleAspectRatioChange}
          onFocusAtPoint={handleFocusAtPoint}
          onFocusAnnotationsChange={handleLiveFocusAnnotationsChange}
        />
        <PhotoStrip
          photos={photoStripItems}
          onSelect={setSelectedAnnotationPhotoId}
          onRemove={handleRemovePendingPhoto}
        />
        {saveMessage ? (
          <p className="text-sm font-medium text-foreground" role="status">
            {saveMessage}
          </p>
        ) : null}
        {showSaveAudio ? (
          <button
            type="button"
            onClick={() => void handleSaveAudio()}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Save audio
          </button>
        ) : null}
        {playbackBlocked && lastResponseAudio ? (
          <button
            type="button"
            onClick={() => void replayLastResponseAudio()}
            className="rounded-full border border-amber-300/50 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
          >
            Tap to enable sound
          </button>
        ) : null}
        <StatusLabel phase={isInsecureContext ? 'error' : phase} />
      </section>

      <footer className="relative z-20 flex w-full flex-col items-center gap-4">
        <BackgroundJobsPill
          activeJobs={activeBackgroundJobs}
          unseenCompletedCount={unseenCompletedJobs.length}
          onOpen={handleOpenJobs}
        />
        {selectedAnnotationPhoto ? (
          <PhotoAnnotationEditor
            key={selectedAnnotationPhoto.id}
            photo={selectedAnnotationPhoto}
            onClose={() => setSelectedAnnotationPhotoId(null)}
            onSave={handleSaveAnnotation}
          />
        ) : null}
        {TranscriptSlot ? <TranscriptSlot chunks={[]} timings={null} /> : null}
        <AudioErrorBanner
          message={insecureContextMessage ?? errorMessage}
          code={isInsecureContext ? 'insecure-context' : errorCode}
          onDismiss={isInsecureContext ? undefined : clearError}
        />
        <VoiceControls
          phase={isInsecureContext ? 'error' : phase}
          isBusy={isBusy}
          recordingDisabled={isInsecureContext}
          agentState={agentState}
          cameraActive={cameraActive}
          unreadDocumentCount={unreadDocumentCount}
          onDisconnect={handleDisconnect}
          onToggleCamera={handleToggleCamera}
          onToggleRecording={handleToggleRecording}
          onCancelRecording={handleCancelRecording}
          onOpenDocuments={() => setDocumentsOpen(true)}
        />
        <DocumentsSheet
          open={documentsOpen}
          onOpenChange={setDocumentsOpen}
          documents={documents}
          backgroundJobs={backgroundJobs}
          isLoading={documentsLoading}
          loadError={documentsError}
          onSelectDocument={handleSelectDocument}
          onRemoveDocument={(id) => void handleRemoveDocument(id)}
        />
        <BackgroundJobsSheet
          open={jobsOpen}
          onOpenChange={handleJobsOpenChange}
          jobs={backgroundJobs}
          onCancelJob={handleCancelBackgroundJob}
          onViewDocuments={handleViewJobDocuments}
        />
      </footer>
    </main>
  );
}
