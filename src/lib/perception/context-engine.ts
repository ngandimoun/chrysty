import { EventEngine } from './event-engine';
import { MemoryManager } from './memory-manager';
import { SceneManager } from './scene-manager';
import type {
  DetectorHealth,
  PerceptionEvent,
  PerceptionMemorySummary,
  PerceptionObservation,
  PerceptionProfileId,
  PerceptionSnapshot,
  SceneState,
} from './types';

export class ContextEngine {
  private readonly sceneManager = new SceneManager();
  private readonly eventEngine = new EventEngine();
  private readonly memoryManager = new MemoryManager();
  private profile: PerceptionProfileId = 'general';
  private detectorHealth: DetectorHealth[] = [];
  private lastEvents: PerceptionEvent[] = [];
  private lastMemory: PerceptionMemorySummary | undefined;

  setProfile(profile: PerceptionProfileId): void {
    this.profile = profile;
  }

  updateDetectorHealth(health: DetectorHealth[]): void {
    this.detectorHealth = health;
  }

  ingest(observations: PerceptionObservation[], now = new Date().toISOString()): PerceptionSnapshot {
    const scene = this.sceneManager.update(observations, now);
    const events = this.eventEngine.update(scene);
    const memory = this.memoryManager.update(observations, events);

    this.lastEvents = events;
    this.lastMemory = memory;

    return this.snapshot(scene, events, memory, now);
  }

  currentSnapshot(): PerceptionSnapshot {
    return this.snapshot(
      this.sceneManager.getScene(),
      this.lastEvents,
      this.lastMemory,
      new Date().toISOString(),
    );
  }

  reset(): void {
    this.sceneManager.reset();
    this.eventEngine.reset();
    this.memoryManager.reset();
    this.lastEvents = [];
    this.lastMemory = undefined;
  }

  private snapshot(
    scene: SceneState,
    events: PerceptionEvent[],
    memory: PerceptionMemorySummary | undefined,
    capturedAt: string,
  ): PerceptionSnapshot {
    return {
      version: 1,
      profile: this.profile,
      capturedAt,
      scene,
      events,
      ...(memory ? { memory } : {}),
      detectorHealth: this.detectorHealth,
    };
  }
}

