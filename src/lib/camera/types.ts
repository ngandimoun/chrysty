export type CameraFacing = 'environment' | 'user';

export type CameraAspectRatio = '16:9' | '4:3' | '1:1';

export type CameraTimerSeconds = 0 | 3 | 5 | 10 | 15 | 30;

export type CaptureMode = 'none' | 'photo' | 'smart_snapshot';
export type FocusAnnotationShape = 'circle' | 'rect' | 'highlight' | 'arrow' | 'pointer';

export const MAX_PENDING_PHOTOS = 7;

export interface FocusAnnotation {
  id: string;
  shape: FocusAnnotationShape;
  x: number;
  y: number;
  width: number;
  height: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
}

export interface PendingPhoto {
  id: string;
  blob: Blob;
  annotatedBlob?: Blob;
  mimeType: string;
  width: number;
  height: number;
  mode: CaptureMode;
  focusAnnotations: FocusAnnotation[];
}

export type CameraErrorCode =
  | 'insecure-context'
  | 'not-supported'
  | 'permission-denied'
  | 'not-found'
  | 'pwa-stuck'
  | 'limit-reached'
  | 'unknown';

export class CameraError extends Error {
  readonly code: CameraErrorCode;

  constructor(code: CameraErrorCode, message: string) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
  }
}

export interface FrameScore {
  sharpness: number;
  luminance: number;
  capturedAt: number;
}

export interface CapturedFrame {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  sharpness: number;
  capturedAt: number;
}
