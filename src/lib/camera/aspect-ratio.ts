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

export interface OrientationAwareShellOptions {
  isLandscape: boolean;
  isCoarsePointer: boolean;
  isTablet?: boolean;
  userAspectRatio: CameraAspectRatio;
}

export function getLegacyShellClass(userAspectRatio: CameraAspectRatio): string {
  return cnShell(
    'w-[min(98vw,64rem)]',
    getAspectRatioShellClass(userAspectRatio),
    'max-h-[min(70dvh,52rem)]',
  );
}

function getLandscapeShellClass(userAspectRatio: CameraAspectRatio): string {
  return cnShell(
    'w-full max-w-none',
    getAspectRatioShellClass(userAspectRatio),
    'max-h-[92dvh]',
  );
}

export function getOrientationAwareShellClass({
  isLandscape,
  isCoarsePointer,
  userAspectRatio,
}: OrientationAwareShellOptions): string {
  if (!isLandscape) {
    return getLegacyShellClass(userAspectRatio);
  }

  if (isCoarsePointer) {
    return getLandscapeShellClass(userAspectRatio);
  }

  return getLegacyShellClass(userAspectRatio);
}

function cnShell(...parts: string[]): string {
  return parts.join(' ');
}

export const CAMERA_PREVIEW_SHELL_BASE_CLASS =
  'relative mx-auto overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-950/60 shadow-[0_0_60px_rgba(31,213,249,0.12)]';

export const DEFAULT_CAMERA_ASPECT_RATIO: CameraAspectRatio = '16:9';
