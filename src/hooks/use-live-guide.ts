'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { uploadAstraKeyHeaders } from '@/lib/astra/identity';
import { AnchorTracker, type TrackedAnchor } from '@/lib/camera/anchor-tracker';
import { prepareVideoFrameForModel } from '@/lib/camera/encode';
import type {
  LiveGuideDirective,
  LiveGuideTaskState,
} from '@/lib/gemini/voice-response-schema';
import type { LiveGuideUpdate } from '@/lib/streaming/types';
import type { VisualCapture, VoiceRequestMode } from '@/hooks/use-voice-agent';

const TRACKING_INTERVAL_MS = 140;
const WATCH_INTERVAL_MS = 8000;
const MAX_WATCH_TURNS_PER_SESSION = 45;

export interface LiveGuideReferenceFrame {
  blob: Blob;
  width: number;
  height: number;
}

interface UseLiveGuideOptions {
  getVideo: () => HTMLVideoElement | null;
  cameraActive: boolean;
  openCamera: () => Promise<void>;
  /** Sends one silent monitoring turn through the normal voice pipeline. */
  sendMonitorTurn: (capture: VisualCapture | null) => Promise<{ ok: boolean; error?: string }>;
  /** True while the agent is recording, processing, or speaking — monitoring pauses. */
  isAgentBusy: () => boolean;
}

interface UseLiveGuideResult {
  active: boolean;
  /** True when the model recommended live guidance and the user has not entered yet. */
  offerAvailable: boolean;
  directives: LiveGuideDirective[];
  tracking: Record<string, TrackedAnchor>;
  coachingNote: string | null;
  task: LiveGuideTaskState | null;
  watchMeEnabled: boolean;
  watchMeBusy: boolean;
  enter: () => Promise<void>;
  exit: () => void;
  dismissOffer: () => void;
  toggleWatchMe: () => void;
  handleLiveGuideUpdate: (update: LiveGuideUpdate) => void;
  /** Shell calls this with the camera frame that was just sent to the model. */
  noteSentFrame: (frame: LiveGuideReferenceFrame) => void;
  getRequestMode: () => VoiceRequestMode;
  getLiveGuideContext: () => string | null;
}

function buildContextSummary(
  task: LiveGuideTaskState | null,
  directives: LiveGuideDirective[],
  coachingNote: string | null,
): string | null {
  const parts: string[] = [];

  if (task?.name) {
    parts.push(
      `task="${task.name}"${task.stage ? ` stage="${task.stage}"` : ''}${task.progress ? ` progress="${task.progress}"` : ''}`,
    );
  }

  if (directives.length > 0) {
    const summary = directives
      .slice(0, 6)
      .map((directive) => `${directive.kind}${directive.label ? `:${directive.label}` : ''}`)
      .join(', ');
    parts.push(`current directives: ${summary}`);
  }

  if (coachingNote) {
    parts.push(`last note: ${coachingNote}`);
  }

  return parts.length > 0 ? parts.join(' | ') : null;
}

export function useLiveGuide({
  getVideo,
  cameraActive,
  openCamera,
  sendMonitorTurn,
  isAgentBusy,
}: UseLiveGuideOptions): UseLiveGuideResult {
  const [active, setActive] = useState(false);
  const [offerAvailable, setOfferAvailable] = useState(false);
  const [directives, setDirectives] = useState<LiveGuideDirective[]>([]);
  const [tracking, setTracking] = useState<Record<string, TrackedAnchor>>({});
  const [coachingNote, setCoachingNote] = useState<string | null>(null);
  const [task, setTask] = useState<LiveGuideTaskState | null>(null);
  const [watchMeEnabled, setWatchMeEnabled] = useState(false);
  const [watchMeBusy, setWatchMeBusy] = useState(false);

  const activeRef = useRef(false);
  const directivesRef = useRef<LiveGuideDirective[]>([]);
  const taskRef = useRef<LiveGuideTaskState | null>(null);
  const coachingNoteRef = useRef<string | null>(null);
  const trackerRef = useRef<AnchorTracker | null>(null);
  const referenceFrameRef = useRef<LiveGuideReferenceFrame | null>(null);
  const watchTurnCountRef = useRef(0);
  const watchInFlightRef = useRef(false);

  const getVideoRef = useRef(getVideo);
  const openCameraRef = useRef(openCamera);
  const sendMonitorTurnRef = useRef(sendMonitorTurn);
  const isAgentBusyRef = useRef(isAgentBusy);
  const cameraActiveRef = useRef(cameraActive);

  useEffect(() => {
    getVideoRef.current = getVideo;
    openCameraRef.current = openCamera;
    sendMonitorTurnRef.current = sendMonitorTurn;
    isAgentBusyRef.current = isAgentBusy;
    cameraActiveRef.current = cameraActive;
  }, [cameraActive, getVideo, isAgentBusy, openCamera, sendMonitorTurn]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    directivesRef.current = directives;
  }, [directives]);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    coachingNoteRef.current = coachingNote;
  }, [coachingNote]);

  const stopTracker = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setTracking({});
  }, []);

  const persistTaskMemory = useCallback(() => {
    const currentTask = taskRef.current;
    if (!currentTask?.name) return;

    const body = JSON.stringify({
      task: currentTask,
      note: coachingNoteRef.current ?? undefined,
    });

    void fetch('/api/live-guide/memory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...uploadAstraKeyHeaders() },
      body,
    }).catch(() => {});
  }, []);

  const enter = useCallback(async () => {
    setOfferAvailable(false);
    if (activeRef.current) return;

    if (!cameraActiveRef.current) {
      try {
        await openCameraRef.current();
      } catch {
        return;
      }
    }

    watchTurnCountRef.current = 0;
    activeRef.current = true;
    setActive(true);
  }, []);

  const exit = useCallback(() => {
    if (!activeRef.current) {
      setOfferAvailable(false);
      return;
    }

    persistTaskMemory();
    stopTracker();
    activeRef.current = false;
    setActive(false);
    setDirectives([]);
    setCoachingNote(null);
    setTask(null);
    setWatchMeEnabled(false);
    setWatchMeBusy(false);
    setOfferAvailable(false);
    referenceFrameRef.current = null;
  }, [persistTaskMemory, stopTracker]);

  const dismissOffer = useCallback(() => {
    setOfferAvailable(false);
  }, []);

  const toggleWatchMe = useCallback(() => {
    setWatchMeEnabled((current) => !current);
  }, []);

  const noteSentFrame = useCallback((frame: LiveGuideReferenceFrame) => {
    referenceFrameRef.current = frame;
  }, []);

  const initializeTrackerForDirectives = useCallback((nextDirectives: LiveGuideDirective[]) => {
    const referenceFrame = referenceFrameRef.current;
    trackerRef.current?.stop();
    trackerRef.current = null;

    setTracking({});
    if (!referenceFrame || nextDirectives.length === 0) {
      return;
    }

    const tracker = new AnchorTracker();
    const anchors = nextDirectives.map((directive) => {
      // Track the directive's centroid; the whole shape translates with it.
      const centroidX =
        directive.points.reduce((sum, point) => sum + point.x, 0) / directive.points.length;
      const centroidY =
        directive.points.reduce((sum, point) => sum + point.y, 0) / directive.points.length;
      return { id: directive.id, x: centroidX, y: centroidY };
    });

    void tracker.initialize(referenceFrame.blob, anchors).then(() => {
      if (tracker.hasAnchors()) {
        trackerRef.current = tracker;
      }
    });
  }, []);

  const handleLiveGuideUpdate = useCallback(
    (update: LiveGuideUpdate) => {
      if (update.guidanceMode === 'live_requested' && !activeRef.current) {
        void enter();
      } else if (update.guidanceMode === 'live_recommended' && !activeRef.current) {
        setOfferAvailable(true);
      }

      const liveGuide = update.liveGuide;
      if (!liveGuide) return;

      const shouldApply =
        activeRef.current || update.guidanceMode === 'live_requested';
      if (!shouldApply) return;

      if (liveGuide.task) {
        setTask(liveGuide.task);
      }
      if (liveGuide.coaching_note) {
        setCoachingNote(liveGuide.coaching_note);
      }

      if (liveGuide.directives.length > 0 || liveGuide.clear_previous) {
        const nextDirectives = liveGuide.clear_previous
          ? liveGuide.directives
          : [...directivesRef.current, ...liveGuide.directives];
        setDirectives(nextDirectives);
        initializeTrackerForDirectives(nextDirectives);
      }
    },
    [enter, initializeTrackerForDirectives],
  );

  // Anchor tracking loop — keeps directives glued to real objects between turns.
  useEffect(() => {
    if (!active || directives.length === 0) return;

    const interval = window.setInterval(() => {
      const tracker = trackerRef.current;
      const video = getVideoRef.current();
      if (!tracker || !video) return;

      const tracked = tracker.track(video);
      if (tracked.length === 0) return;

      setTracking(Object.fromEntries(tracked.map((anchor) => [anchor.id, anchor])));
    }, TRACKING_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [active, directives]);

  // Watch me — periodic silent monitoring turns.
  useEffect(() => {
    if (!active || !watchMeEnabled) return;

    const interval = window.setInterval(() => {
      if (watchInFlightRef.current || isAgentBusyRef.current()) return;
      if (watchTurnCountRef.current >= MAX_WATCH_TURNS_PER_SESSION) {
        setWatchMeEnabled(false);
        return;
      }

      const video = getVideoRef.current();
      if (!video) return;

      watchInFlightRef.current = true;
      setWatchMeBusy(true);

      void (async () => {
        try {
          const frame = await prepareVideoFrameForModel(video);
          if (!frame) return;

          referenceFrameRef.current = { blob: frame.blob, width: frame.width, height: frame.height };
          watchTurnCountRef.current += 1;
          await sendMonitorTurnRef.current({
            blob: frame.blob,
            mimeType: frame.mimeType,
            captureMode: 'smart_snapshot',
            width: frame.width,
            height: frame.height,
          });
        } finally {
          watchInFlightRef.current = false;
          setWatchMeBusy(false);
        }
      })();
    }, WATCH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [active, watchMeEnabled]);

  // Camera closing ends the live session.
  useEffect(() => {
    if (!cameraActive && activeRef.current) {
      exit();
    }
  }, [cameraActive, exit]);

  const getRequestMode = useCallback((): VoiceRequestMode => {
    return activeRef.current ? 'live_guide' : 'default';
  }, []);

  const getLiveGuideContext = useCallback((): string | null => {
    if (!activeRef.current) return null;
    return buildContextSummary(taskRef.current, directivesRef.current, coachingNoteRef.current);
  }, []);

  return {
    active,
    offerAvailable,
    directives,
    tracking,
    coachingNote,
    task,
    watchMeEnabled,
    watchMeBusy,
    enter,
    exit,
    dismissOffer,
    toggleWatchMe,
    handleLiveGuideUpdate,
    noteSentFrame,
    getRequestMode,
    getLiveGuideContext,
  };
}
