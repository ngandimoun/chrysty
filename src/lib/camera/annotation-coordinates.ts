import type { FocusAnnotation } from '@/lib/camera/types';
import { mapPreviewPointToImage } from '@/lib/camera/object-cover';

interface Size {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeAnnotation(annotation: FocusAnnotation): FocusAnnotation {
  const x = clamp(annotation.x, 0, 1);
  const y = clamp(annotation.y, 0, 1);
  const right = clamp(annotation.x + annotation.width, 0, 1);
  const bottom = clamp(annotation.y + annotation.height, 0, 1);

  return {
    ...annotation,
    x,
    y,
    width: Math.max(right - x, 0),
    height: Math.max(bottom - y, 0),
  };
}

function flipAnnotationHorizontally(annotation: FocusAnnotation): FocusAnnotation {
  return {
    ...annotation,
    x: clamp(1 - annotation.x - annotation.width, 0, 1),
    ...(annotation.startX !== undefined ? { startX: clamp(1 - annotation.startX, 0, 1) } : {}),
    ...(annotation.endX !== undefined ? { endX: clamp(1 - annotation.endX, 0, 1) } : {}),
  };
}

function mapPointToImage(
  point: number,
  previewLength: number,
  offset: number,
  renderedLength: number,
  previewCenter: number,
  digitalScale: number,
) {
  const pixel = point * previewLength;
  const unscaled =
    digitalScale === 1 ? pixel : (pixel - previewCenter) / digitalScale + previewCenter;
  return (unscaled - offset) / renderedLength;
}

function mapPreviewCoordToImage(
  previewX: number,
  previewY: number,
  preview: Size,
  image: Size,
  digitalScale: number,
): { x: number; y: number } {
  return mapPreviewPointToImage(previewX, previewY, preview, image, digitalScale);
}

function hasImageArea(annotation: FocusAnnotation): boolean {
  if (annotation.shape === 'pointer') return true;

  if (annotation.shape === 'arrow') {
    const startX = annotation.startX ?? annotation.x;
    const startY = annotation.startY ?? annotation.y;
    const endX = annotation.endX ?? annotation.x + annotation.width;
    const endY = annotation.endY ?? annotation.y + annotation.height;
    return Math.hypot(endX - startX, endY - startY) > 0;
  }

  return annotation.width > 0 && annotation.height > 0;
}

export function mapObjectCoverAnnotationsToImage(
  annotations: FocusAnnotation[],
  preview: Size,
  image: Size,
  mirrored = false,
  digitalScale = 1,
): FocusAnnotation[] {
  if (
    annotations.length === 0 ||
    preview.width <= 0 ||
    preview.height <= 0 ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    return [];
  }

  const scale = Math.max(preview.width / image.width, preview.height / image.height);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  const offsetX = (preview.width - renderedWidth) / 2;
  const offsetY = (preview.height - renderedHeight) / 2;
  const centerX = preview.width / 2;
  const centerY = preview.height / 2;

  return annotations
    .map((annotation) => {
      const topLeft = mapPreviewCoordToImage(annotation.x, annotation.y, preview, image, digitalScale);
      const bottomRight = mapPreviewCoordToImage(
        annotation.x + annotation.width,
        annotation.y + annotation.height,
        preview,
        image,
        digitalScale,
      );
      const imageWidth = bottomRight.x - topLeft.x;
      const imageHeight = bottomRight.y - topLeft.y;
      const mapped = normalizeAnnotation({
        ...annotation,
        x: topLeft.x,
        y: topLeft.y,
        width: imageWidth,
        height: imageHeight,
        ...(annotation.startX !== undefined
          ? {
              startX: clamp(
                mapPointToImage(
                  annotation.startX,
                  preview.width,
                  offsetX,
                  renderedWidth,
                  centerX,
                  digitalScale,
                ),
                0,
                1,
              ),
            }
          : {}),
        ...(annotation.startY !== undefined
          ? {
              startY: clamp(
                mapPointToImage(
                  annotation.startY,
                  preview.height,
                  offsetY,
                  renderedHeight,
                  centerY,
                  digitalScale,
                ),
                0,
                1,
              ),
            }
          : {}),
        ...(annotation.endX !== undefined
          ? {
              endX: clamp(
                mapPointToImage(
                  annotation.endX,
                  preview.width,
                  offsetX,
                  renderedWidth,
                  centerX,
                  digitalScale,
                ),
                0,
                1,
              ),
            }
          : {}),
        ...(annotation.endY !== undefined
          ? {
              endY: clamp(
                mapPointToImage(
                  annotation.endY,
                  preview.height,
                  offsetY,
                  renderedHeight,
                  centerY,
                  digitalScale,
                ),
                0,
                1,
              ),
            }
          : {}),
      });

      return mirrored ? flipAnnotationHorizontally(mapped) : mapped;
    })
    .filter(hasImageArea);
}
