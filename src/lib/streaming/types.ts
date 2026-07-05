export interface TranscriptChunk {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  isFinal: boolean;
  createdAt: number;
}

export interface PlaceCard {
  name: string;
  url: string;
  placeId?: string;
  reviewSnippet?: string;
}

export interface WebCitation {
  url: string;
  title: string;
}

export type { ChartSpec, CodeExecutionImage } from '@/lib/charts/types';
export type { StockImageGroup } from '@/lib/visuals/stock-images';

import type { ChartSpec, CodeExecutionImage } from '@/lib/charts/types';
import type { PhysicalTaskResponse, VisualGuidanceResponse } from '@/lib/gemini/voice-response-schema';
import type { StockImageGroup } from '@/lib/visuals/stock-images';

export interface GuidanceImage {
  id: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  captureMode?: string;
}

export interface ExplanationVisuals {
  places: PlaceCard[];
  charts: ChartSpec[];
  codeImages: CodeExecutionImage[];
  stockImages: StockImageGroup[];
  webCitations: WebCitation[];
  customToolCalls: string[];
  physicalTask: PhysicalTaskResponse | null;
  visualGuidance: VisualGuidanceResponse | null;
}

export interface ExplanationState {
  active: boolean;
  fullText: string;
  isStreaming: boolean;
  places: PlaceCard[];
  charts: ChartSpec[];
  codeImages: CodeExecutionImage[];
  stockImages: StockImageGroup[];
  webCitations: WebCitation[];
  customToolCalls: string[];
  physicalTask: PhysicalTaskResponse | null;
  visualGuidance: VisualGuidanceResponse | null;
  userImages: GuidanceImage[];
}

export const EMPTY_EXPLANATION: ExplanationState = {
  active: false,
  fullText: '',
  isStreaming: false,
  places: [],
  charts: [],
  codeImages: [],
  stockImages: [],
  webCitations: [],
  customToolCalls: [],
  physicalTask: null,
  visualGuidance: null,
  userImages: [],
};

export type AgentStreamEvent =
  | { type: 'transcript'; chunk: TranscriptChunk }
  | { type: 'state'; state: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

// Future: wire to SSE or WebSocket when model backend is added.
// export function useAgentStream(url: string) { ... }
