import { getVideoTrack } from '@/lib/camera/torch';

export interface NumericRange {
  min: number;
  max: number;
  step: number;
}

export interface ZoomState {
  supported: boolean;
  min: number;
  max: number;
  step: number;
  current: number;
}

export interface ExposureState {
  supported: boolean;
  min: number;
  max: number;
  step: number;
  current: number;
}

export interface FocusPoint {
  x: number;
  y: number;
}

type ZoomCapabilities = MediaTrackCapabilities & {
  zoom?: { min?: number; max?: number; step?: number };
};
type ZoomSettings = MediaTrackSettings & { zoom?: number };
type ExposureCapabilities = MediaTrackCapabilities & {
  exposureCompensation?: { min?: number; max?: number; step?: number };
};
type ExposureSettings = MediaTrackSettings & { exposureCompensation?: number };
type FocusCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  pointsOfInterest?: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapToStep(value: number, min: number, step: number): number {
  if (step <= 0) return value;
  const steps = Math.round((value - min) / step);
  return min + steps * step;
}

function readNumericRange(
  range: MediaTrackCapabilities[keyof MediaTrackCapabilities] | undefined,
  fallbackStep = 0.1,
): NumericRange | null {
  if (!range || typeof range !== 'object') return null;

  const candidate = range as { min?: number; max?: number; step?: number };
  if (typeof candidate.min !== 'number' || typeof candidate.max !== 'number') return null;

  return {
    min: candidate.min,
    max: candidate.max,
    step: typeof candidate.step === 'number' && candidate.step > 0 ? candidate.step : fallbackStep,
  };
}

export function getZoomState(track: MediaStreamTrack | null | undefined): ZoomState {
  const unsupported: ZoomState = {
    supported: false,
    min: 1,
    max: 1,
    step: 0.1,
    current: 1,
  };

  if (!track || typeof track.getCapabilities !== 'function') return unsupported;

  const range = readNumericRange((track.getCapabilities() as ZoomCapabilities).zoom, 0.1);
  if (!range || range.max <= range.min) return unsupported;

  const settings = track.getSettings() as ZoomSettings;
  const current =
    typeof settings.zoom === 'number'
      ? clamp(snapToStep(settings.zoom, range.min, range.step), range.min, range.max)
      : range.min;

  return {
    supported: true,
    ...range,
    current,
  };
}

export async function setZoom(track: MediaStreamTrack, value: number): Promise<number> {
  const state = getZoomState(track);
  if (!state.supported) {
    throw new Error('Zoom is not supported on this camera track.');
  }

  const nextValue = clamp(snapToStep(value, state.min, state.step), state.min, state.max);

  try {
    await track.applyConstraints({ zoom: nextValue } as MediaTrackConstraints & { zoom?: number });
    return nextValue;
  } catch {
    // Fall through to advanced constraint shape used on some Android builds.
  }

  await track.applyConstraints({
    advanced: [{ zoom: nextValue }],
  } as unknown as MediaTrackConstraints);

  return nextValue;
}

export function getExposureState(track: MediaStreamTrack | null | undefined): ExposureState {
  const unsupported: ExposureState = {
    supported: false,
    min: 0,
    max: 0,
    step: 0.5,
    current: 0,
  };

  if (!track || typeof track.getCapabilities !== 'function') return unsupported;

  const range = readNumericRange(
    (track.getCapabilities() as ExposureCapabilities).exposureCompensation,
    0.5,
  );
  if (!range || range.max <= range.min) return unsupported;

  const settings = track.getSettings() as ExposureSettings;
  const current =
    typeof settings.exposureCompensation === 'number'
      ? clamp(snapToStep(settings.exposureCompensation, range.min, range.step), range.min, range.max)
      : 0;

  return {
    supported: true,
    ...range,
    current,
  };
}

export async function setExposureCompensation(track: MediaStreamTrack, value: number): Promise<number> {
  const state = getExposureState(track);
  if (!state.supported) {
    throw new Error('Exposure compensation is not supported on this camera track.');
  }

  const nextValue = clamp(snapToStep(value, state.min, state.step), state.min, state.max);

  try {
    await track.applyConstraints({
      exposureCompensation: nextValue,
    } as MediaTrackConstraints & { exposureCompensation?: number });
    return nextValue;
  } catch {
    // Fall through to advanced constraint shape used on some Android builds.
  }

  await track.applyConstraints({
    advanced: [{ exposureCompensation: nextValue }],
  } as unknown as MediaTrackConstraints);

  return nextValue;
}

export function isFocusPointSupported(track: MediaStreamTrack | null | undefined): boolean {
  if (!track || typeof track.getCapabilities !== 'function') return false;

  const capabilities = track.getCapabilities() as FocusCapabilities;
  const focusModes = capabilities.focusMode ?? [];
  const hasManualFocus = Array.isArray(focusModes) && focusModes.includes('manual');
  const pointsOfInterest = capabilities.pointsOfInterest;

  return hasManualFocus || Boolean(pointsOfInterest);
}

export async function focusAtPoint(
  track: MediaStreamTrack,
  point: FocusPoint,
): Promise<void> {
  const x = clamp(point.x, 0, 1);
  const y = clamp(point.y, 0, 1);

  const constraints = {
    advanced: [
      {
        focusMode: 'manual',
        pointsOfInterest: [{ x, y }],
      },
    ],
  } as unknown as MediaTrackConstraints;

  try {
    await track.applyConstraints(constraints);
    return;
  } catch {
    // Fall through to top-level constraint shape used on some browsers.
  }

  await track.applyConstraints({
    focusMode: 'manual',
    pointsOfInterest: [{ x, y }],
  } as MediaTrackConstraints & {
    focusMode?: string;
    pointsOfInterest?: Array<{ x: number; y: number }>;
  });
}

export function getVideoTrackFromStream(stream: MediaStream | null | undefined): MediaStreamTrack | null {
  return getVideoTrack(stream);
}
