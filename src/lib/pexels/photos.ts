import {
  countStockImageTokenOverlap,
  getStockImageSearchTokens,
  MAX_STOCK_IMAGES_TOTAL,
  type StockImage,
  type StockImageGroup,
  type StockImageLayout,
  type StockImageSources,
  type VisualImageGroupRequest,
} from '@/lib/visuals/stock-images';

const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';
const SEARCH_TIMEOUT_MS = 2500;
const PER_PAGE = 6;

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color?: string;
  src: Record<string, string>;
  alt?: string;
}

function getPexelsApiKey(): string {
  return process.env.PEXELS_API_KEY?.trim() ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://');
}

function isPexelsPhoto(value: unknown): value is PexelsPhoto {
  if (!isRecord(value) || !isRecord(value.src)) return false;

  return (
    typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height) &&
    value.height > 0 &&
    isHttpsUrl(value.url) &&
    typeof value.photographer === 'string' &&
    isHttpsUrl(value.photographer_url)
  );
}

function warnPexels(message: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[pexels] ${message}`);
  }
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function orientationForLayout(layout: StockImageLayout): string | null {
  switch (layout) {
    case 'single':
    case 'comparison':
      return 'landscape';
    case 'grid':
      return 'square';
    case 'sequence':
      return null;
  }
}

async function searchPexelsPhotos(
  apiKey: string,
  query: string,
  layout: StockImageLayout,
): Promise<PexelsPhoto[]> {
  const params = new URLSearchParams({
    query,
    per_page: String(PER_PAGE),
    page: '1',
  });
  const orientation = orientationForLayout(layout);
  if (orientation) params.set('orientation', orientation);

  try {
    return await withTimeout(async (signal) => {
      const response = await fetch(`${PEXELS_SEARCH_URL}?${params.toString()}`, {
        headers: {
          Authorization: apiKey,
        },
        cache: 'no-store',
        signal,
      });

      if (!response.ok) {
        warnPexels(`search failed with ${response.status}`);
        return [];
      }

      const payload = (await response.json()) as unknown;
      const photos = isRecord(payload) && Array.isArray(payload.photos) ? payload.photos : [];
      return photos.filter(isPexelsPhoto);
    });
  } catch {
    warnPexels('search timed out or failed');
    return [];
  }
}

function sourceFromPhoto(photo: PexelsPhoto): StockImageSources {
  const src = photo.src;
  return {
    ...(isHttpsUrl(src.tiny) ? { tiny: src.tiny } : {}),
    ...(isHttpsUrl(src.small) ? { small: src.small } : {}),
    ...(isHttpsUrl(src.medium) ? { medium: src.medium } : {}),
    ...(isHttpsUrl(src.large) ? { large: src.large } : {}),
    ...(isHttpsUrl(src.landscape) ? { landscape: src.landscape } : {}),
    ...(isHttpsUrl(src.portrait) ? { portrait: src.portrait } : {}),
  };
}

function primarySource(photo: PexelsPhoto, layout: StockImageLayout): string {
  if (layout === 'single' || layout === 'comparison') {
    return photo.src.landscape ?? photo.src.large ?? photo.src.medium ?? photo.src.original ?? '';
  }

  if (layout === 'grid') {
    return photo.src.medium ?? photo.src.large ?? photo.src.small ?? photo.src.original ?? '';
  }

  return photo.src.large ?? photo.src.medium ?? photo.src.landscape ?? photo.src.original ?? '';
}

function cleanText(value: string | undefined, fallback: string, maxLength: number): string {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return (cleaned || fallback).slice(0, maxLength);
}

function photoRelevanceText(photo: PexelsPhoto): string {
  return [photo.alt, photo.url].filter(Boolean).join(' ');
}

function photoRelevanceScore(photo: PexelsPhoto, query: string): number {
  const queryTokenCount = getStockImageSearchTokens(query).length;
  if (queryTokenCount === 0) return 0;

  const overlap = countStockImageTokenOverlap(query, photoRelevanceText(photo));
  return overlap / queryTokenCount;
}

function selectRelevantPhoto(
  photos: PexelsPhoto[],
  query: string,
  seenPhotoIds: Set<string>,
): PexelsPhoto | undefined {
  return photos
    .filter((photo) => !seenPhotoIds.has(String(photo.id)))
    .map((photo) => ({ photo, score: photoRelevanceScore(photo, query) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.photo;
}

function toStockImage(photo: PexelsPhoto, group: VisualImageGroupRequest, query: string): StockImage | null {
  const src = primarySource(photo, group.layout);
  if (!isHttpsUrl(src)) return null;

  const alt = cleanText(photo.alt, group.title, 180);
  const caption = cleanText(photo.alt, query, 140);
  const avgColor =
    typeof photo.avg_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(photo.avg_color)
      ? photo.avg_color
      : undefined;

  return {
    id: String(photo.id),
    src,
    sources: sourceFromPhoto(photo),
    width: photo.width,
    height: photo.height,
    alt,
    caption,
    sourceUrl: photo.url,
    photographer: cleanText(photo.photographer, 'Pexels photographer', 100),
    photographerUrl: photo.photographer_url,
    query,
    ...(avgColor ? { avgColor } : {}),
  };
}

function maxItemsForGroup(group: VisualImageGroupRequest): number {
  if (group.maxItems) return group.maxItems;

  switch (group.layout) {
    case 'single':
      return 1;
    case 'comparison':
      return 2;
    case 'sequence':
      return 4;
    case 'grid':
      return group.intent === 'ingredient' || group.intent === 'tool' ? 6 : 4;
  }
}

export async function buildPexelsStockImageGroups(
  requests: VisualImageGroupRequest[],
): Promise<StockImageGroup[]> {
  const apiKey = getPexelsApiKey();
  if (!apiKey || requests.length === 0) return [];

  const plannedSearches: Array<{
    groupIndex: number;
    request: VisualImageGroupRequest;
    query: string;
  }> = [];

  for (const [groupIndex, request] of requests.entries()) {
    if (plannedSearches.length >= MAX_STOCK_IMAGES_TOTAL) break;

    const groupMaxItems = maxItemsForGroup(request);
    for (const query of request.queries.slice(0, groupMaxItems)) {
      if (plannedSearches.length >= MAX_STOCK_IMAGES_TOTAL) break;
      plannedSearches.push({ groupIndex, request, query });
    }
  }

  const searchResults = await Promise.all(
    plannedSearches.map(async (planned) => ({
      ...planned,
      photos: await searchPexelsPhotos(apiKey, planned.query, planned.request.layout),
    })),
  );

  const seenPhotoIds = new Set<string>();
  const grouped = new Map<number, { request: VisualImageGroupRequest; maxItems: number; images: StockImage[] }>();
  let remainingTotal = MAX_STOCK_IMAGES_TOTAL;

  for (const [groupIndex, request] of requests.entries()) {
    grouped.set(groupIndex, {
      request,
      maxItems: maxItemsForGroup(request),
      images: [],
    });
  }

  for (const result of searchResults) {
    if (remainingTotal <= 0) break;

    const bucket = grouped.get(result.groupIndex);
    if (!bucket || bucket.images.length >= Math.min(bucket.maxItems, remainingTotal)) continue;

    const selected = selectRelevantPhoto(result.photos, result.query, seenPhotoIds);
    if (!selected) continue;

    const image = toStockImage(selected, result.request, result.query);
    if (!image) continue;

    seenPhotoIds.add(image.id);
    bucket.images.push(image);
    remainingTotal -= 1;
  }

  return Array.from(grouped.values())
    .filter((group) => group.images.length > 0)
    .map(({ request, images }) => ({
      id: request.id,
      title: request.title,
      intent: request.intent,
      layout: request.layout,
      images,
      ...(request.placement ? { placement: request.placement } : {}),
    }));
}
