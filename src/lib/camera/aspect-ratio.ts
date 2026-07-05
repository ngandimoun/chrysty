import type { CameraAspectRatio } from './types';

const ASPECT_RATIO_VALUES: Record<CameraAspectRatio, number> = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
};

const ASPECT_RATIO_LABELS: Record<CameraAspectRatio, string> = {
  '16:9': '16:9',
  '4:3': '4:3',
  '1:1': '1:1',
};

const ASPECT_RATIO_ORDER: CameraAspectRatio[] = ['16:9', '4:3', '1:1'];

export function getAspectRatioConstraintValue(ratio: CameraAspectRatio): number {
  return ASPECT_RATIO_VALUES[ratio];
}

export function getAspectRatioLabel(ratio: CameraAspectRatio): string {
  return ASPECT_RATIO_LABELS[ratio];
}

export function getNextAspectRatio(current: CameraAspectRatio): CameraAspectRatio {
  const index = ASPECT_RATIO_ORDER.indexOf(current);
  const nextIndex = (index + 1) % ASPECT_RATIO_ORDER.length;
  return ASPECT_RATIO_ORDER[nextIndex] ?? '16:9';
}

export function getAspectRatioShellClass(ratio: CameraAspectRatio): string {
  switch (ratio) {
    case '4:3':
      return 'aspect-[4/3]';
    case '1:1':
      return 'aspect-square';
    case '16:9':
    default:
      return 'aspect-video';
  }
}

export const DEFAULT_CAMERA_ASPECT_RATIO: CameraAspectRatio = '16:9';
