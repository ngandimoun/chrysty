import type { CodeExecutionImage } from '@/lib/charts/types';
import { isRegisteredCustomToolName } from '@/lib/gemini/custom-tools';
import { normalizeExplanationMarkdown, type VoiceResponsePayload } from '@/lib/gemini/voice-response-schema';

export interface WebCitation {
  url: string;
  title: string;
}

export interface PlaceCard {
  name: string;
  url: string;
  placeId?: string;
  reviewSnippet?: string;
}

export interface ToolGroundingResult {
  usedSearch: boolean;
  usedMaps: boolean;
  usedUrlContext: boolean;
  usedCodeExecution: boolean;
  usedCustomTools: boolean;
  webCitations: WebCitation[];
  places: PlaceCard[];
  codeImages: CodeExecutionImage[];
  customToolCalls: string[];
  retrievedUrlCount: number;
}

interface InteractionWithSteps {
  steps?: unknown[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function citationTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function extractWebCitation(annotation: unknown): WebCitation | null {
  const record = asRecord(annotation);
  if (!record || record.type !== 'url_citation') {
    return null;
  }

  const url = typeof record.url === 'string' ? record.url.trim() : '';
  if (!url) {
    return null;
  }

  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : citationTitleFromUrl(url);

  return { url, title };
}

function extractPlaceFromAnnotation(annotation: unknown): PlaceCard | null {
  const record = asRecord(annotation);
  if (!record || record.type !== 'place_citation') {
    return null;
  }

  const url = typeof record.url === 'string' ? record.url.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!url && !name) {
    return null;
  }

  const placeId = typeof record.place_id === 'string' ? record.place_id : undefined;
  let reviewSnippet: string | undefined;

  const snippets = record.review_snippets;
  if (Array.isArray(snippets) && snippets.length > 0) {
    const first = asRecord(snippets[0]);
    if (first && typeof first.title === 'string' && first.title.trim()) {
      reviewSnippet = first.title.trim();
    }
  }

  return {
    name: name || citationTitleFromUrl(url),
    url,
    ...(placeId ? { placeId } : {}),
    ...(reviewSnippet ? { reviewSnippet } : {}),
  };
}

function extractPlaceFromResultEntry(entry: unknown): PlaceCard | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const url = typeof record.url === 'string' ? record.url.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!url && !name) {
    return null;
  }

  const placeId = typeof record.place_id === 'string' ? record.place_id : undefined;
  let reviewSnippet: string | undefined;

  const snippets = record.review_snippets;
  if (Array.isArray(snippets) && snippets.length > 0) {
    const first = asRecord(snippets[0]);
    if (first && typeof first.title === 'string' && first.title.trim()) {
      reviewSnippet = first.title.trim();
    }
  }

  return {
    name: name || (url ? citationTitleFromUrl(url) : 'Place'),
    url,
    ...(placeId ? { placeId } : {}),
    ...(reviewSnippet ? { reviewSnippet } : {}),
  };
}

function placeKey(place: PlaceCard): string {
  if (place.placeId) {
    return place.placeId.toLowerCase();
  }
  if (place.url) {
    return place.url.toLowerCase();
  }
  return place.name.toLowerCase();
}

function webCitationKey(citation: WebCitation): string {
  return citation.url.toLowerCase();
}

function mergePlace(existing: PlaceCard, incoming: PlaceCard): PlaceCard {
  return {
    name: existing.name || incoming.name,
    url: existing.url || incoming.url,
    placeId: existing.placeId ?? incoming.placeId,
    reviewSnippet: existing.reviewSnippet ?? incoming.reviewSnippet,
  };
}

function addPlace(places: PlaceCard[], seen: Set<string>, place: PlaceCard | null): void {
  if (!place) {
    return;
  }

  const key = placeKey(place);
  const existingIndex = places.findIndex((item) => placeKey(item) === key);
  if (existingIndex >= 0) {
    places[existingIndex] = mergePlace(places[existingIndex]!, place);
    return;
  }

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  places.push(place);
}

function extractCodeImage(block: unknown): CodeExecutionImage | null {
  const record = asRecord(block);
  if (!record || record.type !== 'image') {
    return null;
  }

  const data = typeof record.data === 'string' ? record.data.trim() : '';
  if (!data) {
    return null;
  }

  const mimeType =
    typeof record.mime_type === 'string' && record.mime_type.trim()
      ? record.mime_type.trim()
      : 'image/png';

  return { mimeType, data };
}

function codeImageKey(image: CodeExecutionImage): string {
  return `${image.mimeType}:${image.data.slice(0, 64)}`;
}

const MAX_CODE_IMAGES = 2;

function countRetrievedUrlsFromResult(result: unknown): number {
  if (Array.isArray(result)) {
    return result.reduce((count, entry) => count + countRetrievedUrlsFromResult(entry), 0);
  }

  const record = asRecord(result);
  if (!record) {
    return 0;
  }

  let count = typeof record.retrieved_url === 'string' && record.retrieved_url.trim() ? 1 : 0;
  if (Array.isArray(record.urls)) {
    count += record.urls.filter((url) => typeof url === 'string' && url.trim()).length;
  }

  return count;
}

export function analyzeToolGroundingFromInteractions(
  interactions: InteractionWithSteps[],
): ToolGroundingResult {
  const steps: unknown[] = [];
  for (const interaction of interactions) {
    if (interaction.steps) {
      steps.push(...interaction.steps);
    }
  }

  return analyzeToolGrounding({ steps });
}

export function analyzeToolGrounding(interaction: InteractionWithSteps): ToolGroundingResult {
  const steps = interaction.steps ?? [];

  const usedSearch = steps.some((step) => {
    const record = asRecord(step);
    return record?.type === 'google_search_call' || record?.type === 'google_search_result';
  });

  const usedMaps = steps.some((step) => {
    const record = asRecord(step);
    return record?.type === 'google_maps_call' || record?.type === 'google_maps_result';
  });

  const usedUrlContext = steps.some((step) => {
    const record = asRecord(step);
    return record?.type === 'url_context_call' || record?.type === 'url_context_result';
  });

  const usedCodeExecution = steps.some((step) => {
    const record = asRecord(step);
    return record?.type === 'code_execution_call' || record?.type === 'code_execution_result';
  });

  const webCitations: WebCitation[] = [];
  const webSeen = new Set<string>();
  const places: PlaceCard[] = [];
  const placeSeen = new Set<string>();
  const codeImages: CodeExecutionImage[] = [];
  const codeImageSeen = new Set<string>();
  const customToolCalls: string[] = [];
  const customToolSeen = new Set<string>();
  let retrievedUrlCount = 0;

  for (const step of steps) {
    const stepRecord = asRecord(step);
    if (!stepRecord) {
      continue;
    }

    if (stepRecord.type === 'function_call') {
      const name = typeof stepRecord.name === 'string' ? stepRecord.name : '';
      if (name && isRegisteredCustomToolName(name) && !customToolSeen.has(name)) {
        customToolSeen.add(name);
        customToolCalls.push(name);
      }
    }

    if (stepRecord.type === 'url_context_result') {
      retrievedUrlCount += countRetrievedUrlsFromResult(stepRecord.result);
    }

    if (stepRecord.type === 'google_maps_result') {
      const result = stepRecord.result;
      if (Array.isArray(result)) {
        for (const resultEntry of result) {
          const resultRecord = asRecord(resultEntry);
          const nestedPlaces = resultRecord?.places;
          if (Array.isArray(nestedPlaces)) {
            for (const nested of nestedPlaces) {
              addPlace(places, placeSeen, extractPlaceFromResultEntry(nested));
            }
          }
        }
      }
    }

    if (stepRecord.type !== 'model_output') {
      continue;
    }

    const content = stepRecord.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const block of content) {
      const blockRecord = asRecord(block);
      if (!blockRecord) {
        continue;
      }

      if (usedCodeExecution && blockRecord.type === 'image') {
        const image = extractCodeImage(block);
        if (image && codeImages.length < MAX_CODE_IMAGES) {
          const key = codeImageKey(image);
          if (!codeImageSeen.has(key)) {
            codeImageSeen.add(key);
            codeImages.push(image);
          }
        }
      }

      if (blockRecord.type !== 'text') {
        continue;
      }

      const annotations = blockRecord.annotations;
      if (!Array.isArray(annotations)) {
        continue;
      }

      for (const annotation of annotations) {
        const webCitation = extractWebCitation(annotation);
        if (webCitation) {
          const key = webCitationKey(webCitation);
          if (!webSeen.has(key)) {
            webSeen.add(key);
            webCitations.push(webCitation);
          }
        }

        addPlace(places, placeSeen, extractPlaceFromAnnotation(annotation));
      }
    }
  }

  return {
    usedSearch,
    usedMaps,
    usedUrlContext,
    usedCodeExecution,
    usedCustomTools: customToolCalls.length > 0,
    webCitations,
    places,
    codeImages,
    customToolCalls,
    retrievedUrlCount,
  };
}

export function stripGoogleMapsSourcesFromExplanation(text: string): string {
  const marker = '\n\nGoogle Maps sources:';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    return text;
  }
  return text.slice(0, idx).trim();
}

export function applyToolGroundingToPayload(
  payload: VoiceResponsePayload,
  grounding: ToolGroundingResult,
): VoiceResponsePayload {
  const hasWebSources =
    (grounding.usedSearch || grounding.usedUrlContext) && grounding.webCitations.length > 0;
  const hasMapsPlaces = grounding.usedMaps && grounding.places.length > 0;
  const hasCharts = payload.charts.length > 0;
  const hasCodeImages = grounding.usedCodeExecution && grounding.codeImages.length > 0;

  if (!hasWebSources && !hasMapsPlaces && !grounding.usedMaps && !hasCharts && !hasCodeImages) {
    return payload;
  }

  const explanationText = payload.explanation_text;
  const shouldShowExplanation =
    payload.needs_visual_explanation ||
    explanationText.trim().length > 0 ||
    hasWebSources ||
    hasMapsPlaces ||
    hasCharts ||
    hasCodeImages;

  if (!shouldShowExplanation) {
    return payload;
  }

  return {
    ...payload,
    needs_visual_explanation: true,
    explanation_text: normalizeExplanationMarkdown(explanationText),
  };
}

/** @deprecated Use analyzeToolGrounding */
export function analyzeSearchGrounding(interaction: InteractionWithSteps) {
  const result = analyzeToolGrounding(interaction);
  return {
    usedSearch: result.usedSearch,
    citations: result.webCitations,
  };
}

/** @deprecated Use applyToolGroundingToPayload */
export function applySearchCitationsToPayload(
  payload: VoiceResponsePayload,
  grounding: { usedSearch: boolean; citations: WebCitation[] },
): VoiceResponsePayload {
  return applyToolGroundingToPayload(payload, {
    usedSearch: grounding.usedSearch,
    usedMaps: false,
    usedUrlContext: false,
    usedCodeExecution: false,
    usedCustomTools: false,
    webCitations: grounding.citations,
    places: [],
    codeImages: [],
    customToolCalls: [],
    retrievedUrlCount: 0,
  });
}
