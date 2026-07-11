import type { FocusAnnotation } from '@/lib/camera/types';
import type { VisualCapture } from '@/hooks/use-voice-agent';
import type { ScreenCapturePayload } from '@/lib/embed/messages';

export { EMBED_MESSAGE, isAllowedEmbedParentOrigin } from '@/lib/embed/messages';

export function screenCaptureToVisualCapture(capture: ScreenCapturePayload): VisualCapture {
  const binary = atob(capture.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: capture.mimeType });
  return {
    blob,
    mimeType: capture.mimeType,
    captureMode: 'smart_snapshot',
    width: capture.width,
    height: capture.height,
    imageId: `embed-${Date.now()}`,
    ...(capture.focusAnnotations
      ? { focusAnnotations: capture.focusAnnotations as unknown as FocusAnnotation[] }
      : {}),
  };
}

export function parseHostReadyPayload(payload: Record<string, unknown>): {
  title: string;
  selectedPassage: string;
  nearbyExcerpt: string;
  artifactLanguage?: string;
  capture: ScreenCapturePayload | null;
} | null {
  const context = payload.context;
  if (!context || typeof context !== 'object') return null;
  const ctx = context as Record<string, unknown>;
  const title = typeof ctx.title === 'string' ? ctx.title : 'Current view';
  const selectedPassage =
    typeof ctx.selectedPassage === 'string'
      ? ctx.selectedPassage
      : typeof ctx.selected_passage === 'string'
        ? ctx.selected_passage
        : '';
  const nearbyExcerpt =
    typeof ctx.nearbyExcerpt === 'string'
      ? ctx.nearbyExcerpt
      : typeof ctx.nearby_excerpt === 'string'
        ? ctx.nearby_excerpt
        : '';
  const artifactLanguage =
    typeof ctx.artifactLanguage === 'string'
      ? ctx.artifactLanguage
      : typeof ctx.artifact_language === 'string'
        ? ctx.artifact_language
        : undefined;

  let capture: ScreenCapturePayload | null = null;
  const rawCapture = payload.capture;
  if (rawCapture && typeof rawCapture === 'object') {
    const c = rawCapture as Record<string, unknown>;
    if (typeof c.base64 === 'string' && typeof c.width === 'number' && typeof c.height === 'number') {
      capture = {
        base64: c.base64,
        mimeType: 'image/jpeg',
        width: c.width,
        height: c.height,
        ...(Array.isArray(c.focusAnnotations)
          ? { focusAnnotations: c.focusAnnotations as ScreenCapturePayload['focusAnnotations'] }
          : {}),
      };
    }
  }

  return { title, selectedPassage, nearbyExcerpt, artifactLanguage, capture };
}

export function resolveParentOrigin(): string | null {
  if (typeof document === 'undefined') return null;
  if (!document.referrer) return null;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}
