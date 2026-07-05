import type { DetectionResult, DetectorHealth, PerceptionDetector, PerceptionObservation, VideoFrameInput } from '../types';
import { createDetectorHealth, drawVideoToCanvas } from './utils';

export function createTextReaderDetector(): PerceptionDetector {
  let status: PerceptionDetector['status'] = 'idle';
  let message: string | undefined;
  let averageLatencyMs: number | undefined;
  let worker: unknown | null = null;

  async function start() {
    if (status === 'ready' || status === 'loading') return;
    status = 'loading';
    message = undefined;

    try {
      const tesseract = await import('tesseract.js');
      const createWorker = (tesseract as unknown as { createWorker?: (language?: string) => Promise<unknown> }).createWorker;
      worker = createWorker ? await createWorker('eng') : null;
      status = worker ? 'ready' : 'failed';
      if (!worker) message = 'Text reading is unavailable.';
    } catch (error) {
      status = 'failed';
      message = error instanceof Error ? error.message : 'Text reading is unavailable.';
    }
  }

  function stop() {
    const activeWorker = worker as { terminate?: () => Promise<void> } | null;
    void activeWorker?.terminate?.().catch(() => {});
    worker = null;
    status = 'idle';
    message = undefined;
  }

  async function detect(frame: VideoFrameInput): Promise<DetectionResult> {
    if (status !== 'ready' || !worker) return { observations: [] };
    const startedAt = performance.now();
    const canvas = drawVideoToCanvas(frame.video, 960);
    if (!canvas) return { observations: [] };

    try {
      const result = await (worker as { recognize?: (source: HTMLCanvasElement) => Promise<{ data?: { text?: string; confidence?: number } }> }).recognize?.(canvas);
      const text = result?.data?.text?.replace(/\s+/g, ' ').trim();
      if (!text) return { observations: [] };

      const observation: PerceptionObservation = {
        id: `text-${frame.frameId}`,
        kind: 'text',
        capability: 'text_reader',
        label: 'Visible text',
        text,
        confidence: Math.max(0, Math.min(1, (result?.data?.confidence ?? 70) / 100)),
        source: 'text_reader',
        frameId: frame.frameId,
        observedAt: frame.capturedAt,
      };
      averageLatencyMs = performance.now() - startedAt;
      return { observations: [observation] };
    } catch {
      averageLatencyMs = performance.now() - startedAt;
      return { observations: [] };
    }
  }

  function getHealth(): DetectorHealth[] {
    return [
      createDetectorHealth('text-reader', 'text_reader', status, 'Text Reader', message, averageLatencyMs),
    ];
  }

  return {
    id: 'text-reader',
    label: 'Text Reader',
    capabilities: ['text_reader'],
    get status() {
      return status;
    },
    priority: 50,
    start,
    stop,
    detect,
    getHealth,
  };
}

