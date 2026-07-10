import assert from 'node:assert/strict';

import { mapObjectCoverAnnotationsToImage } from '@/lib/camera/annotation-coordinates';
import type { FocusAnnotation } from '@/lib/camera/types';

function annotation(shape: FocusAnnotation['shape'], patch: Partial<FocusAnnotation>): FocusAnnotation {
  return {
    id: shape,
    shape,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ...patch,
  };
}

function close(actual: number | undefined, expected: number, message: string): void {
  assert.notEqual(actual, undefined, message);
  assert.ok(Math.abs((actual ?? 0) - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);
}

const [circle] = mapObjectCoverAnnotationsToImage(
  [annotation('circle', { x: 0.25, y: 0.2, width: 0.5, height: 0.4 })],
  { width: 100, height: 100 },
  { width: 400, height: 200 },
);
close(circle.x, 0.375, 'circle x maps through horizontal object-cover crop');
close(circle.y, 0.2, 'circle y maps without vertical crop');
close(circle.width, 0.25, 'circle width preserves its displayed size');
close(circle.height, 0.4, 'circle height preserves its displayed size');

const [rect] = mapObjectCoverAnnotationsToImage(
  [annotation('rect', { x: 0.1, y: 0.2, width: 0.3, height: 0.5 })],
  { width: 160, height: 90 },
  { width: 400, height: 300 },
);
close(rect.x, 0.1, 'rect x maps at 16:9 to 4:3');
close(rect.y, 0.275, 'rect y accounts for vertical object-cover crop');
close(rect.width, 0.3, 'rect width maps at 16:9 to 4:3');
close(rect.height, 0.375, 'rect height maps at 16:9 to 4:3');

const [arrow] = mapObjectCoverAnnotationsToImage(
  [
    annotation('arrow', {
      x: 0.2,
      y: 0.25,
      width: 0.6,
      height: 0.5,
      startX: 0.2,
      startY: 0.25,
      endX: 0.8,
      endY: 0.75,
    }),
  ],
  { width: 100, height: 100 },
  { width: 400, height: 200 },
  true,
);
close(arrow.x, 0.35, 'mirrored arrow bounds remain aligned');
close(arrow.width, 0.3, 'mirrored arrow width maps through object-cover');
close(arrow.startX, 0.65, 'selfie mirror flips arrow start');
close(arrow.endX, 0.35, 'selfie mirror flips arrow end');
close(arrow.startY, 0.25, 'selfie mirror preserves arrow start y');
close(arrow.endY, 0.75, 'selfie mirror preserves arrow end y');

const [pointer] = mapObjectCoverAnnotationsToImage(
  [
    annotation('pointer', {
      x: 0.2,
      y: 0.7,
      width: 0.1,
      height: 0.1,
      endX: 0.25,
      endY: 0.75,
    }),
  ],
  { width: 160, height: 90 },
  { width: 1600, height: 900 },
  false,
  0.5,
);
close(pointer.x, 0, 'dezoom clips pointer bounds at left image edge');
close(pointer.y, 0.9, 'dezoom maps pointer bounds into image space');
close(pointer.width, 0.1, 'dezoom clips pointer width accurately');
close(pointer.height, 0.1, 'dezoom clips pointer height accurately');
close(pointer.endX, 0, 'dezoom maps pointer tip to left image edge');
close(pointer.endY, 1, 'dezoom maps pointer tip to bottom image edge');

const [highlight] = mapObjectCoverAnnotationsToImage(
  [annotation('highlight', { x: 0.2, y: 0.3, width: 0.2, height: 0.4 })],
  { width: 400, height: 300 },
  { width: 1600, height: 1200 },
  true,
  0.5,
);
close(highlight.x, 0.7, 'mirrored dezoom highlight x maps at 4:3');
close(highlight.y, 0.1, 'dezoom highlight y maps at 4:3');
close(highlight.width, 0.3, 'mirrored dezoom highlight width clips at the image edge');
close(highlight.height, 0.8, 'dezoom highlight height expands in image space');

console.log('annotation-coordinate tests passed');
