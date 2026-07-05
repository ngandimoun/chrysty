import type { PerceptionObservation } from './types';

function observationKey(observation: PerceptionObservation): string {
  return `${observation.kind}:${observation.label.toLowerCase()}`;
}

export function fuseObservations(observations: PerceptionObservation[]): PerceptionObservation[] {
  const byKey = new Map<string, PerceptionObservation>();

  for (const observation of observations) {
    const key = observationKey(observation);
    const current = byKey.get(key);
    if (!current || observation.confidence > current.confidence) {
      byKey.set(key, observation);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => right.confidence - left.confidence);
}

