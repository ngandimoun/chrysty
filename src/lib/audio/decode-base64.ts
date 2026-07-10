/**
 * Decode base64 / base64url strings to bytes (handles missing padding and whitespace).
 * Mirrors chrysty-voice STABLE_BASELINE app.js base64ToArray().
 */
export function decodeBase64ToBytes(encoded: string): Uint8Array {
  const trimmed = encoded.replace(/\s/g, '');
  if (!trimmed) {
    return new Uint8Array(0);
  }

  let standard = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  while (standard.length % 4 !== 0) {
    standard += '=';
  }

  try {
    const binary = atob(standard);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid base64';
    throw new Error(`Failed to decode base64 audio: ${message}`);
  }
}
