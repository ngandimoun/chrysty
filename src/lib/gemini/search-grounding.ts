export {
  analyzeSearchGrounding,
  applySearchCitationsToPayload,
  analyzeToolGrounding,
  applyToolGroundingToPayload,
  type PlaceCard,
  type ToolGroundingResult,
  type WebCitation,
} from '@/lib/gemini/tool-grounding';

export type SearchCitation = import('@/lib/gemini/tool-grounding').WebCitation;

export interface SearchGroundingResult {
  usedSearch: boolean;
  citations: SearchCitation[];
}
