import {
  truncateTitle,
  type GeneratedDocumentRecord,
  type GeneratedTextPayload,
} from '@/lib/documents/generated-document-types';
import type { ExplanationState } from '@/lib/streaming/types';
import { normalizeBcp47 } from '@/lib/language/language-resolution';

export function explanationToArtifactRecords(
  explanation: ExplanationState,
): Array<Omit<GeneratedDocumentRecord, 'id' | 'createdAt'>> {
  const text = explanation.fullText.trim();
  if (!hasSavableExplanationContent(explanation)) return [];

  const payload: GeneratedTextPayload = {
    fullText: text,
    ...(explanation.webCitations.length > 0 ? { webCitations: explanation.webCitations } : {}),
    ...(explanation.stockImages.length > 0 ? { stockImages: explanation.stockImages } : {}),
    canvas: {
      charts: explanation.charts,
      codeImages: explanation.codeImages,
      places: explanation.places,
      customToolCalls: explanation.customToolCalls,
      physicalTask: explanation.physicalTask,
      visualGuidance: explanation.visualGuidance,
      userImages: explanation.userImages,
    },
  };

  const fallbackTitle =
    explanation.charts[0]?.title?.trim() ||
    explanation.places[0]?.name?.trim() ||
    'Saved explanation';
  return [{
    kind: 'text',
    title: truncateTitle(text || fallbackTitle),
    jsonPayload: JSON.stringify(payload),
    artifactLanguage: normalizeBcp47(explanation.artifactLanguage) ?? 'en',
  }];
}

export function hasSavableExplanationContent(explanation: ExplanationState): boolean {
  return (
    explanation.fullText.trim().length > 0 ||
    explanation.charts.length > 0 ||
    explanation.codeImages.length > 0 ||
    explanation.stockImages.length > 0 ||
    explanation.places.length > 0 ||
    explanation.webCitations.length > 0
  );
}
