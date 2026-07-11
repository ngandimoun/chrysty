import { toJpeg } from 'html-to-image';

import type { ScreenCaptureResult } from './types.js';

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

function scaleDimensions(width: number, height: number): { width: number; height: number; pixelRatio: number } {
  const maxEdge = Math.max(width, height);
  if (maxEdge <= MAX_EDGE) {
    return { width, height, pixelRatio: 1 };
  }
  const scale = MAX_EDGE / maxEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    pixelRatio: scale,
  };
}

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function getSelectedText(): string {
  if (typeof window === 'undefined') return '';
  return window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
}

export function buildNearbyExcerpt(fullText: string, selection: string, maxChars = 1600): string {
  const normalizedText = fullText.replace(/\s+/g, ' ').trim();
  const normalizedSelection = selection.replace(/\s+/g, ' ').trim();
  if (!normalizedText) return '';
  if (!normalizedSelection) return normalizedText.slice(0, maxChars);
  const index = normalizedText.indexOf(normalizedSelection);
  if (index < 0) return normalizedText.slice(0, maxChars);
  const spare = Math.max(0, maxChars - Math.min(normalizedSelection.length, maxChars));
  const start = Math.max(0, index - Math.floor(spare / 2));
  return normalizedText.slice(start, start + maxChars);
}

export function resolveCaptureElement(captureTarget?: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (captureTarget) {
    const el = document.querySelector(captureTarget);
    if (el instanceof HTMLElement) return el;
  }
  const selection = window.getSelection()?.anchorNode;
  if (selection) {
    let node: Node | null = selection;
    while (node && node !== document.body) {
      if (node instanceof HTMLElement) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'article' || tag === 'main' || node.dataset.chrystyCapture !== undefined) {
          return node;
        }
      }
      node = node.parentNode;
    }
  }
  return document.querySelector('[data-chrysty-capture]') as HTMLElement | null;
}

export async function captureElement(
  captureTarget?: string,
): Promise<ScreenCaptureResult | null> {
  const element = resolveCaptureElement(captureTarget);
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const { pixelRatio } = scaleDimensions(rect.width, rect.height);

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const dataUrl = await toJpeg(element, {
      quality: JPEG_QUALITY,
      pixelRatio,
      cacheBust: true,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        return node.dataset.chrystyIgnoreCapture === undefined;
      },
    });

    const base64 = dataUrlToBase64(dataUrl);
    const width = Math.round(rect.width * pixelRatio);
    const height = Math.round(rect.height * pixelRatio);

    return {
      base64,
      mimeType: 'image/jpeg',
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  } catch {
    return null;
  }
}

export function hostContextToUiPayload(context: {
  title: string;
  selectedPassage?: string;
  nearbyExcerpt?: string;
  artifactLanguage?: string;
}): {
  source: 'explanation_canvas';
  title: string;
  selected_passage: string;
  nearby_excerpt: string;
  saved: false;
  artifact_language?: string;
} {
  return {
    source: 'explanation_canvas',
    title: context.title.slice(0, 160),
    selected_passage: (context.selectedPassage ?? '').slice(0, 800),
    nearby_excerpt: (context.nearbyExcerpt ?? '').slice(0, 1600),
    saved: false,
    ...(context.artifactLanguage
      ? { artifact_language: context.artifactLanguage.slice(0, 40) }
      : {}),
  };
}
