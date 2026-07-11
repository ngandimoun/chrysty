import { getLiveEmbedConfig, isAllowedChrystyOrigin } from './configure.js';
import {
  EMBED_MESSAGE,
  type HostUiContext,
  type LiveGuideUpdate,
  type ScreenCaptureResult,
} from './types.js';

export function postToEmbedIframe(
  iframe: HTMLIFrameElement,
  type: string,
  payload: Record<string, unknown>,
): void {
  const target = iframe.contentWindow;
  if (!target) return;
  const { astraEmbedUrl } = getLiveEmbedConfig();
  target.postMessage({ type, ...payload }, new URL(astraEmbedUrl).origin);
}

export function sendHostReady(
  iframe: HTMLIFrameElement,
  input: {
    context: HostUiContext;
    capture?: ScreenCaptureResult | null;
    selection?: string;
  },
): void {
  postToEmbedIframe(iframe, EMBED_MESSAGE.HOST_READY, {
    context: input.context,
    capture: input.capture ?? null,
    selection: input.selection ?? '',
  });
}

export function sendContextUpdate(
  iframe: HTMLIFrameElement,
  context: HostUiContext,
): void {
  postToEmbedIframe(iframe, EMBED_MESSAGE.CONTEXT_UPDATE, { context });
}

export function sendCaptureUpdate(
  iframe: HTMLIFrameElement,
  input: {
    capture?: ScreenCaptureResult | null;
    selection?: string;
  },
): void {
  postToEmbedIframe(iframe, EMBED_MESSAGE.CAPTURE_UPDATE, {
    capture: input.capture ?? null,
    selection: input.selection ?? '',
  });
}

export function parseEmbedMessage(
  event: MessageEvent,
  allowedParentOrigin?: string,
): { type: string; payload: Record<string, unknown> } | null {
  if (allowedParentOrigin && event.origin !== allowedParentOrigin) {
    if (!isAllowedChrystyOrigin(event.origin)) return null;
  } else if (!isAllowedChrystyOrigin(event.origin)) {
    return null;
  }

  const data = event.data;
  if (!data || typeof data !== 'object' || typeof (data as { type?: unknown }).type !== 'string') {
    return null;
  }

  const { type, ...payload } = data as Record<string, unknown> & { type: string };
  return { type, payload };
}

export function isLiveGuideMessage(
  message: { type: string; payload: Record<string, unknown> } | null,
): LiveGuideUpdate | null {
  if (!message || message.type !== EMBED_MESSAGE.LIVE_GUIDE) return null;
  const directives = message.payload.directives;
  if (!Array.isArray(directives)) return null;
  return {
    directives: directives as LiveGuideUpdate['directives'],
    clearPrevious: message.payload.clearPrevious === true,
    coachingNote:
      typeof message.payload.coachingNote === 'string' ? message.payload.coachingNote : null,
    spokenText: typeof message.payload.spokenText === 'string' ? message.payload.spokenText : null,
  };
}
