import type { NumericRange } from '@/lib/camera/track-controls';

export const DIGITAL_ZOOM_MIN = 0.25;

export interface HardwareZoomRange {
  supported: boolean;
  min: number;
  max: number;
  step: number;
}

export interface SplitZoomResult {
  displayZoom: number;
  hardwareZoom: number;
  digitalScale: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getHardwareZoomRange(zoomState: {
  supported: boolean;
  min: number;
  max: number;
  step: number;
}): HardwareZoomRange {
  if (!zoomState.supported) {
    return { supported: false, min: 1, max: 1, step: 0.1 };
  }

  return {
    supported: true,
    min: zoomState.min,
    max: zoomState.max,
    step: zoomState.step,
  };
}

export function getEffectiveZoomRange(hardware: HardwareZoomRange): NumericRange | null {
  const max = hardware.supported ? hardware.max : 1;
  const min = DIGITAL_ZOOM_MIN;

  if (max <= min) {
    return null;
  }

  const step =
    hardware.supported && hardware.step > 0 ? Math.min(hardware.step, 0.1) : 0.1;

  return { min, max, step };
}

export function canAdjustZoom(hardware: HardwareZoomRange): boolean {
  const range = getEffectiveZoomRange(hardware);
  if (!range) {
    return false;
  }

  return range.max - range.min > range.step * 0.5;
}

export function resolveDefaultZoom(hardware: HardwareZoomRange): number {
  const range = getEffectiveZoomRange(hardware);
  if (!range) {
    return 1;
  }

  if (1 >= range.min && 1 <= range.max) {
    return 1;
  }

  return hardware.supported ? hardware.min : range.min;
}

export function splitZoom(requested: number, hardware: HardwareZoomRange): SplitZoomResult {
  const range = getEffectiveZoomRange(hardware);
  const displayZoom = range ? clamp(requested, range.min, range.max) : 1;
  const hwMin = hardware.supported ? hardware.min : 1;
  const hwMax = hardware.supported ? hardware.max : 1;

  if (displayZoom >= hwMin) {
    return {
      displayZoom,
      hardwareZoom: hardware.supported ? clamp(displayZoom, hwMin, hwMax) : 1,
      digitalScale: 1,
    };
  }

  return {
    displayZoom,
    hardwareZoom: hwMin,
    digitalScale: displayZoom / hwMin,
  };
}
