import type { DetectorHealth, DetectorStatus, PerceptionCapabilityId } from '../types';

export function createDetectorHealth(
  detectorId: string,
  capability: PerceptionCapabilityId,
  status: DetectorStatus,
  label: string,
  message?: string,
  averageLatencyMs?: number,
): DetectorHealth {
  return {
    detectorId,
    capability,
    status,
    label,
    updatedAt: new Date().toISOString(),
    ...(message ? { message } : {}),
    ...(averageLatencyMs !== undefined ? { averageLatencyMs } : {}),
  };
}

export function drawVideoToCanvas(video: HTMLVideoElement, maxLongestEdge = 640): HTMLCanvasElement | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const longest = Math.max(video.videoWidth, video.videoHeight);
  const scale = longest > maxLongestEdge ? maxLongestEdge / longest : 1;
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

