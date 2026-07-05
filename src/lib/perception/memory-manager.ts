import type { PerceptionEvent, PerceptionMemorySummary, PerceptionObservation } from './types';

const MEMORY_LIMIT = 30;

export class MemoryManager {
  private readonly lastSeen = new Map<string, PerceptionMemorySummary['lastSeen'][number]>();
  private recentChanges: PerceptionEvent[] = [];

  update(observations: PerceptionObservation[], events: PerceptionEvent[]): PerceptionMemorySummary {
    for (const observation of observations) {
      if (observation.kind !== 'object' && observation.kind !== 'code' && observation.kind !== 'text') {
        continue;
      }

      const key = `${observation.kind}:${observation.label.toLowerCase()}`;
      this.lastSeen.set(key, {
        label: observation.label,
        kind: observation.kind,
        lastSeenAt: observation.observedAt,
        confidence: observation.confidence,
        summary: `${observation.label} was last seen in the current camera scene.`,
      });
    }

    this.recentChanges = [...this.recentChanges, ...events]
      .filter((event) => event.type !== 'nothing_important_changed')
      .slice(-MEMORY_LIMIT);

    return this.snapshot();
  }

  snapshot(): PerceptionMemorySummary {
    return {
      lastSeen: Array.from(this.lastSeen.values()).slice(-MEMORY_LIMIT),
      recentChanges: [...this.recentChanges],
    };
  }

  reset(): void {
    this.lastSeen.clear();
    this.recentChanges = [];
  }
}

