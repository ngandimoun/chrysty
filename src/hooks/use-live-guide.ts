'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { uploadAstraKeyHeaders } from '@/lib/astra/identity';
import { AnchorTracker, type TrackedAnchor } from '@/lib/camera/anchor-tracker';
import { prepareVideoFrameForModel } from '@/lib/camera/encode';
import type {
  LiveGuideDirective,
  LiveGuideResponse,
  LiveGuideTaskState,
} from '@/lib/gemini/voice-response-schema';
import type { LiveGuideUpdate } from '@/lib/streaming/types';
import type { VisualCapture, VoiceRequestMode } from '@/hooks/use-voice-agent';

const TRACKING_INTERVAL_MS = 140;
const WATCH_INTERVAL_MS = 8000;
const MAX_WATCH_TURNS_PER_SESSION = 45;
const BOOTSTRAP_BUSY_POLL_MS = 200;
const BOOTSTRAP_VIDEO_POLL_MS = 150;
const BOOTSTRAP_MAX_BUSY_WAIT_MS = 15000;
const BOOTSTRAP_MAX_VIDEO_WAIT_MS = 3000;

export interface LiveGuideReferenceFrame {
  blob: Blob;
  width: number;
  height: number;
}

interface UseLiveGuideOptions {
  getVideo: () => HTMLVideoElement | null;
  getDigitalScale?: () => number;
  cameraActive: boolean;
  openCamera: () => Promise<void>;
  sendMonitorTurn: (capture: VisualCapture | null) => Promise<{ ok: boolean; error?: string }>;
  sendBootstrapTurn: (capture: VisualCapture | null) => Promise<{ ok: boolean; error?: string }>;
  isAgentBusy: () => boolean;
}

interface UseLiveGuideResult {
  active: boolean;
  directives: LiveGuideDirective[];
  tracking: Record<string, TrackedAnchor>;
  coachingNote: string | null;
  task: LiveGuideTaskState | null;
  watchMeEnabled: boolean;
  watchMeBusy: boolean;
  bootstrapBusy: boolean;
  spokenText: string | null;
  exit: () => void;
  toggleWatchMe: () => void;
  handleLiveGuideUpdate: (update: LiveGuideUpdate) => void;
  noteSpokenText: (text: string) => void;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useLiveGuide({
  getVideo,
  getDigitalScale,
  cameraActive,
  openCamera,
  sendMonitorTurn,
  sendBootstrapTurn,
  isAgentBusy,
}: UseLiveGuideOptions): UseLiveGuideResult {
  const [active, setActive] = useState(false);
  const [directives, setDirectives] = useState<LiveGuideDirective[]>([]);
  const [tracking, setTracking] = useState<Record<string, TrackedAnchor>>({});
  const [coachingNote, setCoachingNote] = useState<string | null>(null);
  const [task, setTask] = useState<LiveGuideTaskState | null>(null);
  const [watchMeEnabled, setWatchMeEnabled] = useState(false);
  const [watchMeBusy, setWatchMeBusy] = useState(false);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [spokenText, setSpokenText] = useState<string | null>(null);

  const activeRef = useRef(false);
  const directivesRef = useRef<LiveGuideDirective[]>([]);
  const taskRef = useRef<LiveGuideTaskState | null>(null);
  const coachingNoteRef = useRef<string | null>(null);
  const trackerRef = useRef<AnchorTracker | null>(null);
  const referenceFrameRef = useRef<LiveGuideReferenceFrame | null>(null);
  const watchTurnCountRef = useRef(0);
  const watchInFlightRef = useRef(false);
  const bootstrapOnceRef = useRef(false);
  const bootstrapInFlightRef = useRef(false);

  const getVideoRef = useRef(getVideo);
  const getDigitalScaleRef = useRef(getDigitalScale ?? (() => 1));
  const openCameraRef = useRef(openCamera);
  const sendMonitorTurnRef = useRef(sendMonitorTurn);
  const sendBootstrapTurnRef = useRef(sendBootstrapTurn);
  const isAgentBusyRef = useRef(isAgentBusy);
  const cameraActiveRef = useRef(cameraActive);

  useEffect(() => {
    getVideoRef.current = getVideo;
    getDigitalScaleRef.current = getDigitalScale ?? (() => 1);
    openCameraRef.current = openCamera;
    sendMonitorTurnRef.current = sendMonitorTurn;
    sendBootstrapTurnRef.current = sendBootstrapTurn;
    isAgentBusyRef.current = isAgentBusy;
    cameraActiveRef.current = cameraActive;
  }, [cameraActive, getDigitalScale, getVideo, isAgentBusy, openCamera, sendBootstrapTurn, sendMonitorTurn]);

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

  const applyLiveGuideState = useCallback(
    (liveGuide: LiveGuideResponse) => {
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
    [initializeTrackerForDirectives],
  );

  const activateLiveGuide = useCallback(async (): Promise<boolean> => {
    if (activeRef.current) return true;

    if (!cameraActiveRef.current) {
      try {
        await openCameraRef.current();
      } catch {
        return false;
      }
    }

    watchTurnCountRef.current = 0;
    activeRef.current = true;
    setActive(true);
    return true;
  }, []);

  const captureLiveFrame = useCallback(async (): Promise<VisualCapture | null> => {
    const deadline = performance.now() + BOOTSTRAP_MAX_VIDEO_WAIT_MS;
    while (performance.now() < deadline) {
      const video = getVideoRef.current();
      if (video) {
        const frame = await prepareVideoFrameForModel(video, {
          digitalScale: getDigitalScaleRef.current(),
        });
        if (frame) {
          referenceFrameRef.current = {
            blob: frame.blob,
            width: frame.width,
            height: frame.height,
          };
          return {
            blob: frame.blob,
            mimeType: frame.mimeType,
            captureMode: 'smart_snapshot',
            width: frame.width,
            height: frame.height,
          };
        }
      }
      await sleep(BOOTSTRAP_VIDEO_POLL_MS);
    }
    return null;
  }, []);

  const runBootstrapTurn = useCallback(async () => {
    if (bootstrapOnceRef.current || bootstrapInFlightRef.current || !activeRef.current) {
      return;
    }

    bootstrapInFlightRef.current = true;
    bootstrapOnceRef.current = true;
    setBootstrapBusy(true);

    try {
      const busyDeadline = performance.now() + BOOTSTRAP_MAX_BUSY_WAIT_MS;
      while (isAgentBusyRef.current() && performance.now() < busyDeadline) {
        await sleep(BOOTSTRAP_BUSY_POLL_MS);
      }

      const capture = await captureLiveFrame();
      if (!capture || !activeRef.current) return;

      await sendBootstrapTurnRef.current(capture);
    } finally {
      bootstrapInFlightRef.current = false;
      setBootstrapBusy(false);
    }
  }, [captureLiveFrame]);

  const exit = useCallback(() => {
    if (!activeRef.current) return;

    persistTaskMemory();
    stopTracker();
    activeRef.current = false;
    setActive(false);
    setDirectives([]);
    setCoachingNote(null);
    setTask(null);
    setWatchMeEnabled(false);
    setWatchMeBusy(false);
    setBootstrapBusy(false);
    setSpokenText(null);
    bootstrapOnceRef.current = false;
    bootstrapInFlightRef.current = false;
    referenceFrameRef.current = null;
  }, [persistTaskMemory, stopTracker]);

  const toggleWatchMe = useCallback(() => {
    setWatchMeEnabled((current) => !current);
  }, []);

  const noteSentFrame = useCallback((frame: LiveGuideReferenceFrame) => {
    referenceFrameRef.current = frame;
  }, []);

  const noteSpokenText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      setSpokenText(trimmed);
    }
  }, []);

  const handleLiveGuideUpdate = useCallback(
    (update: LiveGuideUpdate) => {
      const isLiveEntry =
        update.guidanceMode === 'live_requested' || update.guidanceMode === 'live_recommended';

      void (async () => {
        if (isLiveEntry && !activeRef.current) {
          const activated = await activateLiveGuide();
          if (!activated) return;

          if (update.liveGuide) {
            applyLiveGuideState(update.liveGuide);
          }

          const hasDirectives = (update.liveGuide?.directives.length ?? 0) > 0;
          if (!hasDirectives) {
            void runBootstrapTurn();
          } else {
            bootstrapOnceRef.current = true;
          }
          return;
        }

        const liveGuide = update.liveGuide;
        if (!liveGuide) return;

        const shouldApply = activeRef.current || isLiveEntry;
        if (!shouldApply) return;

        applyLiveGuideState(liveGuide);
      })();
    },
    [activateLiveGuide, applyLiveGuideState, runBootstrapTurn],
  );

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

  useEffect(() => {
    if (!active || !watchMeEnabled) return;

    const interval = window.setInterval(() => {
      if (watchInFlightRef.current || isAgentBusyRef.current() || bootstrapInFlightRef.current) {
        return;
      }
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
          const frame = await prepareVideoFrameForModel(video, {
          digitalScale: getDigitalScaleRef.current(),
        });
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
    directives,
    tracking,
    coachingNote,
    task,
    watchMeEnabled,
    watchMeBusy,
    bootstrapBusy,
    spokenText,
    exit,
    toggleWatchMe,
    handleLiveGuideUpdate,
    noteSpokenText,
    noteSentFrame,
    getRequestMode,
    getLiveGuideContext,
  };
}
