import { isGeminiAcceptedMimeType, normalizeAudioMimeType } from '@/lib/gemini/config';

const AUDIO_MIME_CANDIDATES = [
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/webm;codecs=opus',
  'audio/webm',
  'video/mp4',
] as const;

export function getRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return undefined;
  }

  return AUDIO_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** @deprecated Use getRecorderMimeType */
export function getSupportedAudioMimeType(): string | undefined {
  return getRecorderMimeType();
}

export function needsAudioConversion(mimeType: string): boolean {
  return !isGeminiAcceptedMimeType(mimeType);
}

export function extensionForMimeType(mimeType: string): string {
  const normalized = normalizeAudioMimeType(mimeType);
  const extensions: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/aiff': 'aiff',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/m4a': 'm4a',
    'audio/opus': 'opus',
  };
  return extensions[normalized] ?? 'wav';
}

export function isSafariOctetStreamBlob(blob: Blob): boolean {
  return blob.type === 'application/octet-stream' || blob.type === '';
}
