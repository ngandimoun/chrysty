import type { ResourceBudget } from './types';

export function estimateResourceBudget(): ResourceBudget {
  if (typeof navigator === 'undefined') {
    return {
      tier: 'medium',
      maxDetectorsPerTick: 2,
      minIntervalMs: 1200,
      reason: 'server-default',
    };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };

  if (nav.connection?.saveData) {
    return {
      tier: 'low',
      maxDetectorsPerTick: 1,
      minIntervalMs: 2500,
      reason: 'save-data',
    };
  }

  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;

  if (cores >= 8 && memory >= 8) {
    return {
      tier: 'high',
      maxDetectorsPerTick: 3,
      minIntervalMs: 700,
      reason: 'high-capability-device',
    };
  }

  if (cores <= 2 || memory <= 2) {
    return {
      tier: 'low',
      maxDetectorsPerTick: 1,
      minIntervalMs: 2200,
      reason: 'limited-device-capability',
    };
  }

  return {
    tier: 'medium',
    maxDetectorsPerTick: 2,
    minIntervalMs: 1200,
    reason: 'balanced-device-capability',
  };
}

