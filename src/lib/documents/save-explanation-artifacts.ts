import type { CodeExecutionImage } from '@/lib/charts/types';
import {
  truncateTitle,
  type GeneratedDocumentRecord,
  type GeneratedChartPayload,
  type GeneratedImagePayload,
  type GeneratedPlacesPayload,
  type GeneratedTextPayload,
} from '@/lib/documents/generated-document-types';
import type { ExplanationState } from '@/lib/streaming/types';

function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function imageRecord(image: CodeExecutionImage, index: number): Omit<GeneratedDocumentRecord, 'id' | 'createdAt'> {
  const mimeType = image.mimeType || 'image/png';
  const payload: GeneratedImagePayload = image.caption ? { caption: image.caption } : {};
  return {
    kind: 'image',
    title: image.caption?.trim() || `Image ${index + 1}`,
    mimeType,
    blob: base64ToBlob(image.data, mimeType),
    jsonPayload: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
  };
}

export function explanationToArtifactRecords(
  explanation: ExplanationState,
): Array<Omit<GeneratedDocumentRecord, 'id' | 'createdAt'>> {
  const records: Array<Omit<GeneratedDocumentRecord, 'id' | 'createdAt'>> = [];

  const text = explanation.fullText.trim();
  if (text || explanation.webCitations.length > 0 || explanation.stockImages.length > 0) {
    const payload: GeneratedTextPayload = {
      fullText: text,
      ...(explanation.webCitations.length > 0 ? { webCitations: explanation.webCitations } : {}),
      ...(explanation.stockImages.length > 0 ? { stockImages: explanation.stockImages } : {}),
    };
    records.push({
      kind: 'text',
      title: truncateTitle(text || 'Text response'),
      jsonPayload: JSON.stringify(payload),
    });
  }

  for (const [index, chart] of explanation.charts.entries()) {
    const payload: GeneratedChartPayload = { chart };
    records.push({
      kind: 'chart',
      title: chart.title?.trim() || `Chart ${index + 1}`,
      jsonPayload: JSON.stringify(payload),
    });
  }

  for (const [index, image] of explanation.codeImages.entries()) {
    records.push(imageRecord(image, index));
  }

  if (explanation.places.length > 0) {
    const payload: GeneratedPlacesPayload = { places: explanation.places };
    const firstName = explanation.places[0]?.name?.trim();
    records.push({
      kind: 'places',
      title: firstName || 'Places',
      jsonPayload: JSON.stringify(payload),
    });
  }

  return records;
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
