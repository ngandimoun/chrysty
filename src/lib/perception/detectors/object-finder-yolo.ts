import { getModelAsset } from '../model-manifest';
import type { DetectionResult, DetectorHealth, PerceptionDetector } from '../types';
import { createDetectorHealth } from './utils';

export function createObjectFinderDetector(): PerceptionDetector {
  let status: PerceptionDetector['status'] = 'idle';
  let message: string | undefined;

  async function start() {
    if (status === 'ready' || status === 'loading') return;
    status = 'loading';
    message = undefined;

    try {
      const asset = getModelAsset('object-finder-yolo');
      if (!asset) {
        status = 'disabled';
        message = 'Object finding model is not configured.';
        return;
      }

      await import('onnxruntime-web');
      status = 'degraded';
      message = 'Object finding runtime is available, but model initialization is not configured yet.';
    } catch (error) {
      status = 'failed';
      message = error instanceof Error ? error.message : 'Object finding is unavailable.';
    }
  }

  function stop() {
    status = 'idle';
    message = undefined;
  }

  async function detect(): Promise<DetectionResult> {
    return { observations: [] };
  }

  function getHealth(): DetectorHealth[] {
    return [
      createDetectorHealth('object-finder', 'object_finder', status, 'Object Finder', message),
    ];
  }

  return {
    id: 'object-finder',
    label: 'Object Finder',
    capabilities: ['object_finder'],
    get status() {
      return status;
    },
    priority: 70,
    start,
    stop,
    detect,
    getHealth,
  };
}

