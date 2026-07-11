/** Shared with @chrysty/live-embed — keep in sync. */
export const EMBED_MESSAGE = {
  EMBED_READY: 'chrysty:embed_ready',
  HOST_READY: 'chrysty:host_ready',
  CONTEXT_UPDATE: 'chrysty:context_update',
  CAPTURE_UPDATE: 'chrysty:capture_update',
  CONNECTED: 'chrysty:connected',
  SPEAKING: 'chrysty:speaking',
  LIVE_GUIDE: 'chrysty:live_guide',
  CLOSED: 'chrysty:closed',
} as const;

export interface ScreenCapturePayload {
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  focusAnnotations?: Array<Record<string, unknown>>;
}

const LOCALHOST_PATTERN = /^127\.\d+\.\d+\.\d+$/;
const LAN_PATTERN = /^192\.168\.\d+\.\d+$/;

export function isAllowedEmbedParentOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
    if (LOCALHOST_PATTERN.test(hostname) || LAN_PATTERN.test(hostname)) return true;
    return hostname === 'chrysty.dev' || hostname.endsWith('.chrysty.dev');
  } catch {
    return false;
  }
}
