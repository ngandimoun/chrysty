import type { PerceptionCapabilityId, PerceptionDetector } from './types';

export class DetectorRegistry {
  private readonly detectors = new Map<string, PerceptionDetector>();

  register(detector: PerceptionDetector): void {
    this.detectors.set(detector.id, detector);
  }

  unregister(detectorId: string): void {
    this.detectors.delete(detectorId);
  }

  list(): PerceptionDetector[] {
    return Array.from(this.detectors.values());
  }

  findByCapability(capability: PerceptionCapabilityId): PerceptionDetector[] {
    return this.list()
      .filter((detector) => detector.capabilities.includes(capability))
      .sort((left, right) => right.priority - left.priority);
  }
}

export function createDetectorRegistry(detectors: PerceptionDetector[] = []): DetectorRegistry {
  const registry = new DetectorRegistry();
  for (const detector of detectors) {
    registry.register(detector);
  }
  return registry;
}

