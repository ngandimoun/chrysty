import type { GoogleGenAI } from '@google/genai';

import { isWavContainer, wrapPcm16LeAsWav } from '@/lib/audio/wav-container';
import { isRawPcmMimeType, normalizeAudioMimeType } from '@/lib/gemini/config';

export function isInteractionAudioMimeFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('mime') ||
    message.includes('format') ||
    message.includes('unsupported') ||
    message.includes('code execution')
  );
}

export function sanitizeInteractionAudio(
  bytes: Buffer,
  mimeType: string,
): { bytes: Buffer; mimeType: string } {
  const normalizedMimeType = normalizeAudioMimeType(mimeType);

  if (isWavContainer(bytes)) {
    return { bytes, mimeType: 'audio/wav' };
  }

  if (isRawPcmMimeType(normalizedMimeType)) {
    return {
      bytes: Buffer.from(wrapPcm16LeAsWav(bytes)),
      mimeType: 'audio/wav',
    };
  }

  return { bytes, mimeType: normalizedMimeType };
}

export function sanitizeUploadedMime(
  detectedMime: string | undefined,
  requestedMime: string,
  bytes: Buffer,
): string {
  if (isWavContainer(bytes)) {
    return 'audio/wav';
  }

  const detected = normalizeAudioMimeType(detectedMime ?? requestedMime);
  const requested = normalizeAudioMimeType(requestedMime);

  if (isRawPcmMimeType(detected)) {
    return isRawPcmMimeType(requested) ? 'audio/wav' : requested;
  }

  return detected;
}

export async function uploadSanitizedAudioForGemini(
  client: GoogleGenAI,
  bytes: Buffer,
  mimeType: string,
): Promise<{ uri: string; mimeType: string }> {
  const sanitized = sanitizeInteractionAudio(bytes, mimeType);
  let uploadBytes = sanitized.bytes;
  let uploadMime = sanitized.mimeType;

  const uploadedFile = await client.files.upload({
    file: new Blob([new Uint8Array(uploadBytes)], { type: uploadMime }),
    config: { mimeType: uploadMime },
  });

  if (!uploadedFile.uri) {
    throw new Error('Gemini file upload did not return a URI.');
  }

  const resolvedMime = sanitizeUploadedMime(uploadedFile.mimeType, uploadMime, uploadBytes);

  if (isRawPcmMimeType(resolvedMime)) {
    if (!isWavContainer(uploadBytes)) {
      uploadBytes = Buffer.from(wrapPcm16LeAsWav(uploadBytes));
    }
    uploadMime = 'audio/wav';

    const reuploadedFile = await client.files.upload({
      file: new Blob([new Uint8Array(uploadBytes)], { type: uploadMime }),
      config: { mimeType: uploadMime },
    });

    if (!reuploadedFile.uri) {
      throw new Error('Gemini file upload did not return a URI.');
    }

    return {
      uri: reuploadedFile.uri,
      mimeType: 'audio/wav',
    };
  }

  return {
    uri: uploadedFile.uri,
    mimeType: resolvedMime,
  };
}
