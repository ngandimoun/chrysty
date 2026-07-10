import { createLocalAudioTrack, type LocalAudioTrack } from 'livekit-client';

import { getSupportedAudioMimeType } from './mime';

export type MicErrorCode =
  | 'insecure-context'
  | 'not-supported'
  | 'permission-denied'
  | 'not-found'
  | 'mime-unsupported'
  | 'pwa-stuck'
  | 'unknown';

export class MicError extends Error {
  readonly code: MicErrorCode;

  constructor(code: MicErrorCode, message: string) {
    super(message);
    this.name = 'MicError';
    this.code = code;
  }
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari legacy flag
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function isSecureMicContext(): boolean {
  if (typeof window === 'undefined') return true;
  return window.isSecureContext;
}

export function getInsecureContextMessage(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'YOUR-IP';
  return `Microphone requires HTTPS. On iPad, open https://${host}:3000 after running pnpm certs:install and pnpm dev:https on your PC.`;
}

export function assertSecureContext(): void {
  if (typeof window === 'undefined') return;
  if (!isSecureMicContext()) {
    throw new MicError('insecure-context', getInsecureContextMessage());
  }
}

export function assertMicSupported(): void {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new MicError('not-supported', 'Audio recording is not supported in this browser.');
  }

  if (typeof MediaRecorder !== 'undefined' && !getSupportedAudioMimeType()) {
    throw new MicError('mime-unsupported', "This browser doesn't support a compatible audio recording format.");
  }
}

export function mapGetUserMediaError(error: unknown): MicError {
  if (error instanceof MicError) return error;

  const name = error instanceof DOMException ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);

  console.warn('[mic] acquire failed', { name, message, error });

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return new MicError(
        'permission-denied',
        'Microphone permission denied. Enable microphone access in your browser or device settings.',
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new MicError('not-found', 'No microphone was found on this device.');
    case 'NotSupportedError':
      return new MicError('mime-unsupported', "This browser doesn't support audio recording here.");
    case 'NotReadableError':
      return new MicError(
        'unknown',
        'Microphone is in use by another app. Close other apps using the mic and try again.',
      );
    case 'OverconstrainedError':
      return new MicError(
        'unknown',
        'Microphone settings are not supported on this device. Try again or use a different browser.',
      );
    case 'AbortError':
      return new MicError('unknown', 'Microphone access was interrupted. Tap Record and try again.');
    default:
      if (isStandalonePwa()) {
        return new MicError(
          'pwa-stuck',
          'Microphone unavailable in the installed app. Try opening this page in Safari or Chrome, or restart your device.',
        );
      }
      return new MicError('unknown', 'Could not access the microphone. Please try again.');
  }
}

export async function acquireLocalAudioTrack(): Promise<LocalAudioTrack> {
  assertSecureContext();
  assertMicSupported();

  try {
    return await createLocalAudioTrack({
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  } catch (error) {
    throw mapGetUserMediaError(error);
  }
}

export function releaseLocalAudioTrack(track: LocalAudioTrack | null | undefined): void {
  if (!track) return;
  track.stop();
  track.mediaStream?.getTracks().forEach((mediaTrack) => mediaTrack.stop());
}

export function releaseMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function unlockAudioContext(): Promise<void> {
  if (typeof window === 'undefined') return;

  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  await ctx.close();
}
