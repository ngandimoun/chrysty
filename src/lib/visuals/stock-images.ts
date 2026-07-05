export const STOCK_IMAGE_INTENTS = [
  'hero',
  'ingredient',
  'tool',
  'step',
  'part',
  'place',
  'safety',
  'example',
] as const;

export const STOCK_IMAGE_LAYOUTS = ['single', 'grid', 'sequence', 'comparison'] as const;

export const MAX_STOCK_IMAGE_GROUPS = 4;
export const MAX_STOCK_IMAGE_QUERIES_PER_GROUP = 6;
export const MAX_STOCK_IMAGES_PER_GROUP = 6;
export const MAX_STOCK_IMAGES_TOTAL = 8;

const CONCRETE_STOCK_IMAGE_INTENTS = new Set<string>([
  'ingredient',
  'tool',
  'step',
  'part',
  'place',
  'safety',
  'example',
]);

const STOCK_IMAGE_STOP_WORDS = new Set<string>([
  'about',
  'after',
  'also',
  'and',
  'are',
  'before',
  'best',
  'can',
  'close',
  'for',
  'from',
  'get',
  'has',
  'have',
  'how',
  'image',
  'into',
  'its',
  'like',
  'look',
  'make',
  'more',
  'near',
  'need',
  'not',
  'one',
  'only',
  'photo',
  'picture',
  'reference',
  'show',
  'that',
  'the',
  'their',
  'them',
  'then',
  'this',
  'through',
  'use',
  'using',
  'what',
  'when',
  'where',
  'with',
  'your',
]);

const GENERIC_STOCK_IMAGE_TOKENS = new Set<string>([
  'abstract',
  'aesthetic',
  'assistant',
  'background',
  'business',
  'concept',
  'conceptual',
  'decorative',
  'digital',
  'futuristic',
  'generic',
  'happy',
  'lifestyle',
  'people',
  'person',
  'robot',
  'smiling',
  'tech',
  'technology',
  'wallpaper',
]);

const GENERIC_STOCK_IMAGE_PHRASES = [
  'abstract background',
  'ai assistant',
  'artificial intelligence',
  'digital background',
  'futuristic technology',
  'happy person',
  'smiling person',
  'stock photo',
  'technology background',
  'virtual assistant',
  'voice assistant',
];

export type StockImageIntent = (typeof STOCK_IMAGE_INTENTS)[number];
export type StockImageLayout = (typeof STOCK_IMAGE_LAYOUTS)[number];

export interface VisualImageGroupRequest {
  id: string;
  title: string;
  intent: StockImageIntent;
  layout: StockImageLayout;
  queries: string[];
  placement?: string;
  maxItems?: number;
}

export interface StockImageSources {
  tiny?: string;
  small?: string;
  medium?: string;
  large?: string;
  landscape?: string;
  portrait?: string;
}

export interface StockImage {
  id: string;
  src: string;
  sources: StockImageSources;
  width: number;
  height: number;
  alt: string;
  caption: string;
  sourceUrl: string;
  photographer: string;
  photographerUrl: string;
  query: string;
  avgColor?: string;
}

export interface StockImageGroup {
  id: string;
  title: string;
  intent: StockImageIntent;
  layout: StockImageLayout;
  images: StockImage[];
  placement?: string;
}

export interface VisualImageRelevanceContext {
  transcript?: string;
  explanationText?: string;
}

const INTENT_SET = new Set<string>(STOCK_IMAGE_INTENTS);
const LAYOUT_SET = new Set<string>(STOCK_IMAGE_LAYOUTS);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeSearchToken(token: string): string {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith('s') && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}

export function getStockImageSearchTokens(value: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const rawToken of normalizeSearchText(value).split(/[^a-z0-9]+/)) {
    const token = normalizeSearchToken(rawToken);
    if (token.length < 3 || STOCK_IMAGE_STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

function hasGenericStockImagePhrase(query: string): boolean {
  const normalized = normalizeSearchText(query).replace(/[^a-z0-9]+/g, ' ').trim();
  return GENERIC_STOCK_IMAGE_PHRASES.some((phrase) => normalized.includes(phrase));
}

function isConcreteStockImageQuery(query: string): boolean {
  const tokens = getStockImageSearchTokens(query);
  if (tokens.length < 2 || hasGenericStockImagePhrase(query)) return false;
  return tokens.some((token) => !GENERIC_STOCK_IMAGE_TOKENS.has(token));
}

export function countStockImageTokenOverlap(source: string, target: string): number {
  const targetTokens = new Set(getStockImageSearchTokens(target));
  if (targetTokens.size === 0) return 0;
  return getStockImageSearchTokens(source).filter((token) => targetTokens.has(token)).length;
}

function cleanUrl(value: unknown): string {
  const url = cleanString(value, 1000);
  if (!url.startsWith('https://')) return '';
  return url;
}

function cleanId(value: unknown, fallback: string): string {
  const raw = cleanString(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw || fallback;
}

function parseIntent(value: unknown): StockImageIntent {
  const raw = cleanString(value, 32);
  return INTENT_SET.has(raw) ? (raw as StockImageIntent) : 'example';
}

function parseLayout(value: unknown, intent: StockImageIntent): StockImageLayout {
  const raw = cleanString(value, 32);
  if (LAYOUT_SET.has(raw)) return raw as StockImageLayout;
  if (intent === 'hero') return 'single';
  if (intent === 'step') return 'sequence';
  return 'grid';
}

function parseMaxItems(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(1, Math.min(MAX_STOCK_IMAGES_PER_GROUP, Math.floor(numeric)));
}

function parseQueries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const queries: string[] = [];
  for (const item of value) {
    const query = cleanString(item, 120);
    const key = query.toLowerCase();
    if (!query || seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length >= MAX_STOCK_IMAGE_QUERIES_PER_GROUP) break;
  }
  return queries;
}

export function parseVisualImageGroupRequests(raw: unknown): VisualImageGroupRequest[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, MAX_STOCK_IMAGE_GROUPS)
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;

      const queries = parseQueries(record.queries);
      if (queries.length === 0) return null;

      const intent = parseIntent(record.intent);
      const layout = parseLayout(record.layout, intent);
      const title = cleanString(record.title, 80) || queries[0] || `Visual ${index + 1}`;
      const maxItems = parseMaxItems(record.maxItems);
      const placement = cleanString(record.placement, 80);

      return {
        id: cleanId(record.id, `visual-${index + 1}`),
        title,
        intent,
        layout,
        queries,
        ...(placement ? { placement } : {}),
        ...(maxItems ? { maxItems } : {}),
      } satisfies VisualImageGroupRequest;
    })
    .filter((group): group is VisualImageGroupRequest => group !== null);
}

export function filterRelevantVisualImageGroupRequests(
  requests: VisualImageGroupRequest[],
  context: VisualImageRelevanceContext,
): VisualImageGroupRequest[] {
  if (requests.length === 0) return [];

  const contextText = `${context.transcript ?? ''} ${context.explanationText ?? ''}`;
  if (getStockImageSearchTokens(contextText).length === 0) return [];

  return requests
    .map((request) => {
      if (!CONCRETE_STOCK_IMAGE_INTENTS.has(request.intent)) return null;

      const queries = request.queries.filter(
        (query) => isConcreteStockImageQuery(query) && countStockImageTokenOverlap(query, contextText) > 0,
      );

      if (queries.length === 0) return null;

      return {
        ...request,
        queries,
        ...(request.maxItems ? { maxItems: Math.min(request.maxItems, queries.length) } : {}),
      } satisfies VisualImageGroupRequest;
    })
    .filter((group): group is VisualImageGroupRequest => group !== null)
    .slice(0, MAX_STOCK_IMAGE_GROUPS);
}

function parseSources(value: unknown): StockImageSources {
  const record = asRecord(value);
  if (!record) return {};

  return {
    ...(cleanUrl(record.tiny) ? { tiny: cleanUrl(record.tiny) } : {}),
    ...(cleanUrl(record.small) ? { small: cleanUrl(record.small) } : {}),
    ...(cleanUrl(record.medium) ? { medium: cleanUrl(record.medium) } : {}),
    ...(cleanUrl(record.large) ? { large: cleanUrl(record.large) } : {}),
    ...(cleanUrl(record.landscape) ? { landscape: cleanUrl(record.landscape) } : {}),
    ...(cleanUrl(record.portrait) ? { portrait: cleanUrl(record.portrait) } : {}),
  };
}

function parseStockImage(value: unknown): StockImage | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = cleanId(record.id, '');
  const src = cleanUrl(record.src);
  const sourceUrl = cleanUrl(record.sourceUrl);
  const photographerUrl = cleanUrl(record.photographerUrl);
  const width = Number(record.width);
  const height = Number(record.height);
  const alt = cleanString(record.alt, 180);
  const photographer = cleanString(record.photographer, 100);
  const query = cleanString(record.query, 120);

  if (
    !id ||
    !src ||
    !sourceUrl ||
    !photographerUrl ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !photographer
  ) {
    return null;
  }

  const caption = cleanString(record.caption, 140) || alt || query;
  const avgColor = cleanString(record.avgColor, 16);

  return {
    id,
    src,
    sources: parseSources(record.sources),
    width,
    height,
    alt: alt || caption || 'Pexels photo',
    caption: caption || 'Reference photo',
    sourceUrl,
    photographer,
    photographerUrl,
    query,
    ...(avgColor ? { avgColor } : {}),
  };
}

export function parseStockImageGroups(raw: unknown): StockImageGroup[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, MAX_STOCK_IMAGE_GROUPS)
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;

      const intent = parseIntent(record.intent);
      const layout = parseLayout(record.layout, intent);
      const title = cleanString(record.title, 80) || `Visual ${index + 1}`;
      const placement = cleanString(record.placement, 80);
      const images = Array.isArray(record.images)
        ? record.images
            .slice(0, MAX_STOCK_IMAGES_PER_GROUP)
            .map((image) => parseStockImage(image))
            .filter((image): image is StockImage => image !== null)
        : [];

      if (images.length === 0) return null;

      return {
        id: cleanId(record.id, `visual-${index + 1}`),
        title,
        intent,
        layout,
        images,
        ...(placement ? { placement } : {}),
      } satisfies StockImageGroup;
    })
    .filter((group): group is StockImageGroup => group !== null)
    .slice(0, MAX_STOCK_IMAGE_GROUPS);
}
