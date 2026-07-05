import type { ChartSpec } from '@/lib/charts/types';
import type { PlaceCard, WebCitation } from '@/lib/streaming/types';
import type { StockImageGroup } from '@/lib/visuals/stock-images';

export const MAX_GENERATED_DOCUMENTS = 100;
export const MAX_GENERATED_DOCUMENT_BYTES = 25 * 1024 * 1024;

export type GeneratedDocumentKind = 'text' | 'image' | 'chart' | 'audio' | 'places' | 'other';

export interface GeneratedTextPayload {
  fullText: string;
  webCitations?: WebCitation[];
  stockImages?: StockImageGroup[];
}

export interface GeneratedChartPayload {
  chart: ChartSpec;
}

export interface GeneratedImagePayload {
  caption?: string;
}

export interface GeneratedAudioPayload {
  sampleRate: number;
}

export interface GeneratedPlacesPayload {
  places: PlaceCard[];
}

export interface GeneratedDocumentRecord {
  id: string;
  kind: GeneratedDocumentKind;
  title: string;
  createdAt: number;
  readAt?: number | null;
  mimeType?: string;
  blob?: Blob;
  jsonPayload?: string;
  jobId?: string | null;
}

export class GeneratedDocumentError extends Error {
  readonly code: 'limit-reached' | 'too-large' | 'storage-unavailable' | 'invalid-payload';

  constructor(code: GeneratedDocumentError['code'], message: string) {
    super(message);
    this.name = 'GeneratedDocumentError';
    this.code = code;
  }
}

export function truncateTitle(text: string, max = 48): string {
  const line = text.trim().split('\n')[0]?.trim() ?? '';
  if (!line) return 'Untitled';
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

export function kindLabel(kind: GeneratedDocumentKind): string {
  switch (kind) {
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    case 'chart':
      return 'Chart';
    case 'audio':
      return 'Audio';
    case 'places':
      return 'Places';
    default:
      return 'Other';
  }
}
