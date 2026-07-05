import type { DetectionResult, DetectorHealth, PerceptionDetector } from '../types';
import { createDetectorHealth } from './utils';

export function createBodyTrackingDetector(): PerceptionDetector {
  let status: PerceptionDetector['status'] = 'idle';
  let message: string | undefined;

  async function start() {
    if (status === 'ready' || status === 'loading') return;
    status = 'loading';
    message = undefined;

    try {
      await import('@mediapipe/tasks-vision');
      status = 'degraded';
      message = 'Body tracking runtime is available, but model assets are not configured yet.';
    } catch (error) {
      status = 'failed';
      message = error instanceof Error ? error.message : 'Body tracking is unavailable.';
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
      createDetectorHealth('body-tracking-pose', 'pose_tracking', status, 'Pose Tracking', message),
      createDetectorHealth('body-tracking-hands', 'hand_tracking', status, 'Hand Tracking', message),
      createDetectorHealth('body-tracking-face', 'face_awareness', status, 'Face Awareness', message),
      createDetectorHealth('body-tracking-gestures', 'gesture_detection', status, 'Gesture Detection', message),
    ];
  }

  return {
    id: 'body-tracking',
    label: 'Body Tracking',
    capabilities: ['pose_tracking', 'hand_tracking', 'face_awareness', 'gesture_detection'],
    get status() {
      return status;
    },
    priority: 65,
    start,
    stop,
    detect,
    getHealth,
  };
}

