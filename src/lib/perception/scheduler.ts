import { capabilitiesForProfile } from './capabilities';
import type {
  DetectorContext,
  PerceptionDetector,
  PerceptionProfileId,
  ResourceBudget,
  ScheduledDetector,
} from './types';

const CAPABILITY_INTERVALS_MS: Record<string, number> = {
  code_scanner: 900,
  object_finder: 1800,
  text_reader: 3500,
  hand_tracking: 900,
  pose_tracking: 900,
  face_awareness: 1500,
  gesture_detection: 900,
  scene_change_monitor: 1200,
  memory_assist: 2500,
};

export class FrameScheduler {
  private profile: PerceptionProfileId = 'general';
  private budget: ResourceBudget;

  constructor(budget: ResourceBudget) {
    this.budget = budget;
  }

  setProfile(profile: PerceptionProfileId): void {
    this.profile = profile;
  }

  setBudget(budget: ResourceBudget): void {
    this.budget = budget;
  }

  getContext(): DetectorContext {
    return {
      profile: this.profile,
      enabledCapabilities: capabilitiesForProfile(this.profile),
      budget: this.budget,
    };
  }

  schedule(detectors: PerceptionDetector[]): ScheduledDetector[] {
    const enabled = capabilitiesForProfile(this.profile);
    const candidates = detectors
      .filter((detector) => detector.status !== 'disabled' && detector.status !== 'failed')
      .filter((detector) => detector.capabilities.some((capability) => enabled.has(capability)))
      .map((detector) => {
        const firstCapability = detector.capabilities.find((capability) => enabled.has(capability));
        const capabilityInterval = firstCapability
          ? CAPABILITY_INTERVALS_MS[firstCapability] ?? this.budget.minIntervalMs
          : this.budget.minIntervalMs;
        return {
          detector,
          priority: detector.priority,
          intervalMs: Math.max(capabilityInterval, this.budget.minIntervalMs),
        };
      })
      .sort((left, right) => right.priority - left.priority);

    return candidates.slice(0, this.budget.maxDetectorsPerTick);
  }
}

