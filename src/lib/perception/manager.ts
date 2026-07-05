'use client';

import { PerceptionBus } from './bus';
import { ContextEngine } from './context-engine';
import { createBodyTrackingDetector } from './detectors/body-tracking';
import { createCodeScannerDetector } from './detectors/code-scanner';
import { createObjectFinderDetector } from './detectors/object-finder-yolo';
import { createTextReaderDetector } from './detectors/text-reader';
import { perceptionMetrics } from './metrics';
import { createDetectorRegistry } from './registry';
import { estimateResourceBudget } from './resource-budget';
import { FrameScheduler } from './scheduler';
import type { PerceptionProfileId, PerceptionSnapshot, VideoFrameInput } from './types';
import { createUuid } from '@/lib/ids';

export interface PerceptionManagerOptions {
  profile?: PerceptionProfileId;
  enabled?: boolean;
}

export class PerceptionManager {
  private readonly bus = new PerceptionBus();
  private readonly contextEngine = new ContextEngine();
  private readonly registry = createDetectorRegistry([
    createCodeScannerDetector(),
    createTextReaderDetector(),
    createObjectFinderDetector(),
    createBodyTrackingDetector(),
  ]);
  private readonly scheduler = new FrameScheduler(estimateResourceBudget());
  private video: HTMLVideoElement | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private tickInFlight = false;

  constructor(options: PerceptionManagerOptions = {}) {
    const profile = options.profile ?? 'general';
    this.scheduler.setProfile(profile);
    this.contextEngine.setProfile(profile);
    if (options.enabled === false) {
      perceptionMetrics.record('manager_disabled');
    }
  }

  setProfile(profile: PerceptionProfileId): void {
    this.scheduler.setProfile(profile);
    this.contextEngine.setProfile(profile);
    perceptionMetrics.record('profile_set', { profile });
  }

  start(video: HTMLVideoElement): void {
    this.video = video;
    if (this.running) return;
    this.running = true;
    const budget = estimateResourceBudget();
    this.scheduler.setBudget(budget);
    perceptionMetrics.record('manager_started', { budget: budget.tier, reason: budget.reason });

    this.intervalId = setInterval(() => {
      void this.tick();
    }, budget.minIntervalMs);

    void this.tick();
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    this.video = null;
    for (const detector of this.registry.list()) {
      detector.stop();
    }
    perceptionMetrics.record('manager_stopped');
  }

  snapshot(): PerceptionSnapshot {
    return this.contextEngine.currentSnapshot();
  }

  reset(): void {
    this.bus.clear();
    this.contextEngine.reset();
  }

  private async tick(): Promise<void> {
    if (this.tickInFlight || !this.running || !this.video) return;
    if (this.video.videoWidth === 0 || this.video.videoHeight === 0) return;

    this.tickInFlight = true;
    const capturedAt = new Date().toISOString();
    const frame: VideoFrameInput = {
      video: this.video,
      frameId: createUuid(),
      capturedAt,
      profile: this.scheduler.getContext().profile,
    };

    try {
      const context = this.scheduler.getContext();
      const scheduled = this.scheduler.schedule(this.registry.list());
      const observations = [];
      const emittedEvents = [];

      for (const item of scheduled) {
        const startedAt = performance.now();
        await item.detector.start();
        const result = await item.detector.detect(frame, context);
        observations.push(...result.observations);
        emittedEvents.push(...(result.events ?? []));
        perceptionMetrics.record('detector_tick', {
          detector: item.detector.id,
          latencyMs: Math.round(performance.now() - startedAt),
          observations: result.observations.length,
        });
      }

      const health = this.registry.list().flatMap((detector) => detector.getHealth());
      this.contextEngine.updateDetectorHealth(health);
      this.bus.publishObservations(observations);
      this.bus.publishEvents(emittedEvents);
      const snapshot = this.contextEngine.ingest(this.bus.getRecentObservations(), capturedAt);
      this.bus.publishEvents(snapshot.events);
    } finally {
      this.tickInFlight = false;
    }
  }
}

export function isPerceptionEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_PERCEPTION_ENABLED?.trim().toLowerCase();
  return value !== 'false' && value !== '0' && value !== 'no';
}

