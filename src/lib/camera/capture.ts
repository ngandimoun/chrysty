import type { CapturedFrame, FrameScore } from './types';

const SHARPNESS_SAMPLE_WIDTH = 320;

const MIN_LUMINANCE = 25;
const MAX_LUMINANCE = 245;

export function isAcceptableLuminance(luminance: number): boolean {
  return luminance >= MIN_LUMINANCE && luminance <= MAX_LUMINANCE;
}

export function scoreVideoFrame(video: HTMLVideoElement): FrameScore | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return null;
  }

  const sampleWidth = Math.min(SHARPNESS_SAMPLE_WIDTH, video.videoWidth);
  const sampleHeight = Math.round((video.videoHeight / video.videoWidth) * sampleWidth);

  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);

  const luminance = scoreMeanLuminance(ctx, sampleWidth, sampleHeight);
  if (!isAcceptableLuminance(luminance)) {
    return null;
  }

  return {
    sharpness: scoreSharpness(ctx, sampleWidth, sampleHeight),
    luminance,
    capturedAt: performance.now(),
  };
}

function scoreMeanLuminance(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  let sum = 0;

  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }

  return sum / (data.length / 4);
}

export function scoreSharpness(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  const gray = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }

  let sum = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        -4 * gray[idx]! +
        gray[idx - 1]! +
        gray[idx + 1]! +
        gray[idx - width]! +
        gray[idx + width]!;
      sum += laplacian * laplacian;
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

export function pickBestScore(scores: FrameScore[]): FrameScore | null {
  if (scores.length === 0) return null;

  let best = scores[0]!;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i]!.sharpness > best.sharpness) {
      best = scores[i]!;
    }
  }

  return best;
}

export function pickBestFrame(frames: CapturedFrame[]): CapturedFrame | null {
  if (frames.length === 0) return null;

  let best = frames[0]!;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i]!.sharpness > best.sharpness) {
      best = frames[i]!;
    }
  }

  return best;
}
