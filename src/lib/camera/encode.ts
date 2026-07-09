import { drawVideoFrameObjectCover } from '@/lib/camera/object-cover';

export const IMAGE_MAX_LONGEST_EDGE = 1280;
export const IMAGE_JPEG_QUALITY = 0.8;

export interface PrepareVideoFrameOptions {
  digitalScale?: number;
  previewAspect?: number;
}

export interface PreparedImageForModel {
  blob: Blob;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

export function computeDownscaledDimensions(
  width: number,
  height: number,
  maxLongestEdge = IMAGE_MAX_LONGEST_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxLongestEdge) {
    return { width, height };
  }

  const scale = maxLongestEdge / longestEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function encodeCanvasAsJpeg(
  canvas: HTMLCanvasElement,
  quality = IMAGE_JPEG_QUALITY,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode JPEG.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

function resolvePreviewAspect(
  video: HTMLVideoElement,
  previewAspect?: number,
): number {
  if (previewAspect && previewAspect > 0) {
    return previewAspect;
  }

  const shell = video.parentElement;
  if (shell && shell.clientWidth > 0 && shell.clientHeight > 0) {
    return shell.clientWidth / shell.clientHeight;
  }

  return video.videoWidth / video.videoHeight;
}

function computeOutputDimensions(
  video: HTMLVideoElement,
  previewAspect: number,
  maxLongestEdge = IMAGE_MAX_LONGEST_EDGE,
): { width: number; height: number } {
  const videoAspect = video.videoWidth / video.videoHeight;
  let width: number;
  let height: number;

  if (previewAspect >= videoAspect) {
    width = Math.round(video.videoWidth);
    height = Math.round(width / previewAspect);
  } else {
    height = Math.round(video.videoHeight);
    width = Math.round(height * previewAspect);
  }

  return computeDownscaledDimensions(width, height, maxLongestEdge);
}

export async function prepareVideoFrameForModel(
  video: HTMLVideoElement,
  options: PrepareVideoFrameOptions = {},
): Promise<PreparedImageForModel | null> {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  // HAVE_CURRENT_DATA — no decoded frame yet (common right after play() on some devices).
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return null;
  }

  const digitalScale = options.digitalScale ?? 1;
  const previewAspect = resolvePreviewAspect(video, options.previewAspect);
  const { width, height } = computeOutputDimensions(video, previewAspect);
  if (width === 0 || height === 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (digitalScale < 1) {
    drawVideoFrameObjectCover(ctx, video, { width, height }, digitalScale);
  } else {
    ctx.drawImage(video, 0, 0, width, height);
  }

  const blob = await encodeCanvasAsJpeg(canvas);
  return {
    blob,
    mimeType: 'image/jpeg',
    width,
    height,
  };
}
