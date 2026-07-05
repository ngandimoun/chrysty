import { isStandalonePwa } from '@/lib/audio/mic';

import { DEFAULT_CAMERA_ASPECT_RATIO, getAspectRatioConstraintValue } from './aspect-ratio';
import type { CameraAspectRatio, CameraFacing, CameraErrorCode } from './types';
import { CameraError } from './types';

export function assertCameraSupported(): void {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('not-supported', 'Camera is not supported in this browser.');
  }
}

export function assertSecureCameraContext(): void {
  if (typeof window === 'undefined') return;
  if (!window.isSecureContext) {
    const host = window.location.hostname;
    throw new CameraError(
      'insecure-context',
      `Camera requires HTTPS. On iPad, open https://${host}:3000 after running pnpm certs:install and pnpm dev:https on your PC.`,
    );
  }
}

export function mapCameraGetUserMediaError(error: unknown): CameraError {
  if (error instanceof CameraError) return error;

  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return new CameraError(
        'permission-denied',
        'Camera permission denied. Enable camera access in your browser or device settings.',
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new CameraError('not-found', 'No camera was found on this device.');
    case 'NotSupportedError':
      return new CameraError('not-supported', "This browser doesn't support camera access here.");
    case 'OverconstrainedError':
      return new CameraError('not-found', 'The requested camera is not available on this device.');
    default:
      if (isStandalonePwa()) {
        return new CameraError(
          'pwa-stuck',
          'Camera unavailable in the installed app. Try opening this page in Safari or Chrome.',
        );
      }
      return new CameraError('unknown', 'Could not access the camera. Please try again.');
  }
}

export function buildVideoConstraints(
  facing: CameraFacing,
  aspectRatio: CameraAspectRatio = DEFAULT_CAMERA_ASPECT_RATIO,
): MediaTrackConstraints {
  return {
    facingMode: { ideal: facing },
    aspectRatio: { ideal: getAspectRatioConstraintValue(aspectRatio) },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
}

export async function acquireVideoStream(
  facing: CameraFacing,
  aspectRatio: CameraAspectRatio = DEFAULT_CAMERA_ASPECT_RATIO,
): Promise<MediaStream> {
  assertSecureCameraContext();
  assertCameraSupported();

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: buildVideoConstraints(facing, aspectRatio),
      audio: false,
    });
  } catch (error) {
    throw mapCameraGetUserMediaError(error);
  }
}

export function releaseVideoStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function switchVideoFacing(
  currentStream: MediaStream | null,
  facing: CameraFacing,
  aspectRatio: CameraAspectRatio = DEFAULT_CAMERA_ASPECT_RATIO,
): Promise<MediaStream> {
  releaseVideoStream(currentStream);
  return acquireVideoStream(facing, aspectRatio);
}

export async function hasMultipleCameras(): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === 'videoinput');
    return videoInputs.length > 1;
  } catch {
    return true;
  }
}

export function getCameraErrorCode(error: unknown): CameraErrorCode {
  if (error instanceof CameraError) return error.code;
  return 'unknown';
}
