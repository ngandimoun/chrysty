import type { DetectionResult, DetectorHealth, PerceptionDetector, PerceptionObservation, VideoFrameInput } from '../types';
import { createDetectorHealth, drawVideoToCanvas } from './utils';

type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string; format?: string; boundingBox?: DOMRectReadOnly }>>;
};

function hasNativeBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

export function createCodeScannerDetector(): PerceptionDetector {
  let status: PerceptionDetector['status'] = 'idle';
  let message: string | undefined;
  let nativeDetector: NativeBarcodeDetector | null = null;
  let zxingReader: unknown | null = null;
  let averageLatencyMs: number | undefined;

  async function start() {
    if (status === 'ready' || status === 'loading') return;
    status = 'loading';
    message = undefined;

    try {
      if (hasNativeBarcodeDetector()) {
        const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector: new (options?: { formats?: string[] }) => NativeBarcodeDetector }).BarcodeDetector;
        nativeDetector = new BarcodeDetectorCtor();
      } else {
        const zxing = await import('@zxing/browser');
        const Reader = (zxing as unknown as { BrowserMultiFormatReader?: new () => unknown }).BrowserMultiFormatReader;
        zxingReader = Reader ? new Reader() : null;
      }
      status = 'ready';
    } catch (error) {
      status = 'failed';
      message = error instanceof Error ? error.message : 'Code scanning is unavailable.';
    }
  }

  function stop() {
    nativeDetector = null;
    zxingReader = null;
    status = 'idle';
    message = undefined;
  }

  async function detect(frame: VideoFrameInput): Promise<DetectionResult> {
    if (status !== 'ready') return { observations: [] };
    const startedAt = performance.now();
    const canvas = drawVideoToCanvas(frame.video, 720);
    if (!canvas) return { observations: [] };

    try {
      const observations: PerceptionObservation[] = [];

      if (nativeDetector) {
        const codes = await nativeDetector.detect(canvas);
        for (const code of codes) {
          const value = code.rawValue?.trim();
          if (!value) continue;
          observations.push({
            id: `code-${frame.frameId}-${observations.length}`,
            kind: 'code',
            capability: 'code_scanner',
            label: code.format ?? 'Code',
            value,
            format: code.format,
            confidence: 0.95,
            source: 'code_scanner',
            frameId: frame.frameId,
            observedAt: frame.capturedAt,
          });
        }
      } else if (zxingReader) {
        const reader = zxingReader as { decodeFromCanvas?: (canvas: HTMLCanvasElement) => { getText?: () => string; getBarcodeFormat?: () => string } };
        const result = reader.decodeFromCanvas?.(canvas);
        const value = result?.getText?.()?.trim();
        if (value) {
          observations.push({
            id: `code-${frame.frameId}-0`,
            kind: 'code',
            capability: 'code_scanner',
            label: 'Code',
            value,
            format: String(result?.getBarcodeFormat?.() ?? 'code'),
            confidence: 0.9,
            source: 'code_scanner',
            frameId: frame.frameId,
            observedAt: frame.capturedAt,
          });
        }
      }

      averageLatencyMs = performance.now() - startedAt;
      return { observations };
    } catch {
      averageLatencyMs = performance.now() - startedAt;
      return { observations: [] };
    }
  }

  function getHealth(): DetectorHealth[] {
    return [
      createDetectorHealth(
        'code-scanner',
        'code_scanner',
        status,
        'Code Scanner',
        message,
        averageLatencyMs,
      ),
    ];
  }

  return {
    id: 'code-scanner',
    label: 'Code Scanner',
    capabilities: ['code_scanner'],
    get status() {
      return status;
    },
    priority: 90,
    start,
    stop,
    detect,
    getHealth,
  };
}

