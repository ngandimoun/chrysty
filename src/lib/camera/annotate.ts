'use client';

import { encodeCanvasAsJpeg } from '@/lib/camera/encode';
import type { FocusAnnotation } from '@/lib/camera/types';

const MIN_STROKE_PX = 2;
const MAX_STROKE_PX = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function sanitizeFocusAnnotation(annotation: FocusAnnotation): FocusAnnotation {
  const x = clamp(annotation.x, 0, 1);
  const y = clamp(annotation.y, 0, 1);
  const width = clamp(annotation.width, 0, 1 - x);
  const height = clamp(annotation.height, 0, 1 - y);

  return {
    id: annotation.id,
    shape: annotation.shape,
    x,
    y,
    width,
    height,
    ...(annotation.startX !== undefined ? { startX: clamp(annotation.startX, 0, 1) } : {}),
    ...(annotation.startY !== undefined ? { startY: clamp(annotation.startY, 0, 1) } : {}),
    ...(annotation.endX !== undefined ? { endX: clamp(annotation.endX, 0, 1) } : {}),
    ...(annotation.endY !== undefined ? { endY: clamp(annotation.endY, 0, 1) } : {}),
  };
}

export function sanitizeFocusAnnotations(annotations: FocusAnnotation[]): FocusAnnotation[] {
  return annotations.map(sanitizeFocusAnnotation);
}

function getStrokeWidth(width: number, height: number): number {
  return clamp(Math.min(width, height) * 0.006, MIN_STROKE_PX, MAX_STROKE_PX);
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load captured photo for annotation.'));
    };

    image.src = url;
  });
}

function annotationToPixels(annotation: FocusAnnotation, width: number, height: number) {
  return {
    x: annotation.x * width,
    y: annotation.y * height,
    width: annotation.width * width,
    height: annotation.height * height,
  };
}

function drawCircleAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: FocusAnnotation,
  width: number,
  height: number,
): void {
  const box = annotationToPixels(annotation, width, height);
  const strokeWidth = getStrokeWidth(width, height);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(125, 211, 252, 0.055)';
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, box.width / 2, box.height / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = strokeWidth + 2.5;
  ctx.strokeStyle = 'rgba(8, 15, 30, 0.66)';
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, box.width / 2, box.height / 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = '#7dd3fc';
  ctx.shadowColor = 'rgba(125, 211, 252, 0.35)';
  ctx.shadowBlur = strokeWidth;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, box.width / 2, box.height / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRectAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: FocusAnnotation,
  width: number,
  height: number,
): void {
  const box = annotationToPixels(annotation, width, height);
  const strokeWidth = getStrokeWidth(width, height);

  ctx.save();
  ctx.fillStyle = 'rgba(125, 211, 252, 0.045)';
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.lineWidth = strokeWidth + 2.5;
  ctx.strokeStyle = 'rgba(8, 15, 30, 0.66)';
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = '#7dd3fc';
  ctx.shadowColor = 'rgba(125, 211, 252, 0.35)';
  ctx.shadowBlur = strokeWidth;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function drawHighlightAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: FocusAnnotation,
  width: number,
  height: number,
): void {
  const box = annotationToPixels(annotation, width, height);
  const strokeWidth = getStrokeWidth(width, height);

  ctx.save();
  ctx.fillStyle = 'rgba(253, 224, 71, 0.15)';
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
  ctx.shadowColor = 'rgba(250, 204, 21, 0.22)';
  ctx.shadowBlur = strokeWidth;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function drawArrowAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: FocusAnnotation,
  width: number,
  height: number,
): void {
  const strokeWidth = getStrokeWidth(width, height);
  const startX = (annotation.startX ?? annotation.x) * width;
  const startY = (annotation.startY ?? annotation.y) * height;
  const endX = (annotation.endX ?? annotation.x + annotation.width) * width;
  const endY = (annotation.endY ?? annotation.y + annotation.height) * height;
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = clamp(Math.min(width, height) * 0.03, 10, 26);
  const headAngle = Math.PI / 7;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokeWidth + 2.5;
  ctx.strokeStyle = 'rgba(8, 15, 30, 0.72)';
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.lineTo(endX - headLength * Math.cos(angle - headAngle), endY - headLength * Math.sin(angle - headAngle));
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - headLength * Math.cos(angle + headAngle), endY - headLength * Math.sin(angle + headAngle));
  ctx.stroke();

  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = '#7dd3fc';
  ctx.shadowColor = 'rgba(125, 211, 252, 0.35)';
  ctx.shadowBlur = strokeWidth;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.lineTo(endX - headLength * Math.cos(angle - headAngle), endY - headLength * Math.sin(angle - headAngle));
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - headLength * Math.cos(angle + headAngle), endY - headLength * Math.sin(angle + headAngle));
  ctx.stroke();
  ctx.restore();
}

function drawPointerAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: FocusAnnotation,
  width: number,
  height: number,
): void {
  const strokeWidth = getStrokeWidth(width, height);
  const centerX = (annotation.endX ?? annotation.x + annotation.width / 2) * width;
  const centerY = (annotation.endY ?? annotation.y + annotation.height / 2) * height;
  const radius = clamp(Math.min(width, height) * 0.012, 5, 13);
  const tailLength = radius * 0.9;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 15, 30, 0.82)';
  ctx.strokeStyle = 'rgba(8, 15, 30, 0.78)';
  ctx.lineWidth = Math.max(1, strokeWidth * 0.7);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#7dd3fc';
  ctx.shadowColor = 'rgba(125, 211, 252, 0.32)';
  ctx.shadowBlur = strokeWidth;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(centerX, centerY + radius * 0.75);
  ctx.lineTo(centerX - radius * 0.38, centerY + radius + tailLength);
  ctx.lineTo(centerX + radius * 0.38, centerY + radius + tailLength);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFocusAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: FocusAnnotation,
  width: number,
  height: number,
): void {
  if (!isDrawableAnnotation(annotation)) {
    return;
  }

  switch (annotation.shape) {
    case 'circle':
      drawCircleAnnotation(ctx, annotation, width, height);
      return;
    case 'highlight':
      drawHighlightAnnotation(ctx, annotation, width, height);
      return;
    case 'arrow':
      drawArrowAnnotation(ctx, annotation, width, height);
      return;
    case 'pointer':
      drawPointerAnnotation(ctx, annotation, width, height);
      return;
    case 'rect':
    default:
      drawRectAnnotation(ctx, annotation, width, height);
  }
}

function isDrawableAnnotation(annotation: FocusAnnotation): boolean {
  if (annotation.shape === 'pointer') {
    return true;
  }

  if (annotation.shape === 'arrow') {
    const startX = annotation.startX ?? annotation.x;
    const startY = annotation.startY ?? annotation.y;
    const endX = annotation.endX ?? annotation.x + annotation.width;
    const endY = annotation.endY ?? annotation.y + annotation.height;
    return Math.hypot(endX - startX, endY - startY) > 0;
  }

  return annotation.width > 0 && annotation.height > 0;
}

export async function burnFocusAnnotations(
  blob: Blob,
  annotations: FocusAnnotation[],
): Promise<{ blob: Blob; width: number; height: number }> {
  const sanitized = sanitizeFocusAnnotations(annotations).filter(isDrawableAnnotation);
  const image = await loadImageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare annotation canvas.');
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const annotation of sanitized) {
    drawFocusAnnotation(ctx, annotation, canvas.width, canvas.height);
  }

  return {
    blob: await encodeCanvasAsJpeg(canvas),
    width: canvas.width,
    height: canvas.height,
  };
}
