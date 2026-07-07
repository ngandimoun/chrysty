import { getGeminiTtsVoice } from '@/lib/gemini/config';
import {
  CHART_PALETTE,
  MAX_CHART_ROWS,
  MAX_CHARTS,
  type ChartKind,
  type ChartSeries,
  type ChartSpec,
} from '@/lib/charts/types';
import { normalizeExplanationMarkdown } from '@/lib/format/explanation-markdown';
import {
  MAX_STOCK_IMAGE_GROUPS,
  MAX_STOCK_IMAGE_QUERIES_PER_GROUP,
  STOCK_IMAGE_INTENTS,
  STOCK_IMAGE_LAYOUTS,
  parseVisualImageGroupRequests,
  type VisualImageGroupRequest,
} from '@/lib/visuals/stock-images';

export type { ChartSpec, ChartSeries, ChartKind } from '@/lib/charts/types';
export type { VisualImageGroupRequest } from '@/lib/visuals/stock-images';

export interface VoiceResponsePayload {
  needs_visual_explanation: boolean;
  explanation_text: string;
  spoken_transcript: string;
  delivery_tag: string;
  charts: ChartSpec[];
  visual_image_groups: VisualImageGroupRequest[];
  physical_task?: PhysicalTaskResponse | null;
  visual_guidance?: VisualGuidanceResponse | null;
  guidance_mode: GuidanceMode;
  live_guide?: LiveGuideResponse | null;
}

/**
 * Semantic, model-decided hint about how guidance should be delivered.
 * - `static`: normal turn; annotated stills / explanation canvas are enough.
 * - `live_recommended`: real-time on-camera guidance would help; UI offers it.
 * - `live_requested`: the user explicitly asked (any language/phrasing) for
 *   step-by-step live help; UI enters Live Guide directly.
 */
export type GuidanceMode = 'static' | 'live_recommended' | 'live_requested';

export type LiveGuideDirectiveKind = 'pointer' | 'path' | 'region' | 'ghost';

export type LiveGuideEmphasis = 'primary' | 'secondary' | 'warning';

export interface LiveGuideDirective {
  id: string;
  kind: LiveGuideDirectiveKind;
  /** Normalized 0-1 coordinates on the reference camera frame (parser converts the model's 0-1000 convention). */
  points: VisualGuidancePoint[];
  label?: string;
  detail?: string;
  emphasis?: LiveGuideEmphasis;
  sequence?: number;
}

export interface LiveGuideInterjection {
  should_speak: boolean;
  urgency?: string;
}

export interface LiveGuideTaskState {
  name?: string;
  stage?: string;
  progress?: string;
}

export interface LiveGuideResponse {
  directives: LiveGuideDirective[];
  clear_previous: boolean;
  coaching_note?: string;
  interjection?: LiveGuideInterjection;
  task?: LiveGuideTaskState;
}

export interface PhysicalTaskState {
  task?: string;
  stage?: string;
  progress?: string;
  confidence?: string;
}

export interface PhysicalEvidenceItem {
  text: string;
  source?: string;
  confidence?: string;
}

export interface PhysicalNextAction {
  title: string;
  detail?: string;
  why?: string;
  check?: string;
  example?: string;
}

export interface PhysicalSafetyNote {
  message: string;
  severity?: string;
  stopCondition?: string;
}

export interface PhysicalVisualAnnotation {
  label: string;
  display_number?: number;
  image_id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  confidence?: string;
}

/** Options passed to response parsers when camera images are attached. */
export interface VoiceResponseParseOptions {
  imageIds?: string[];
}

export interface PhysicalTaskResponse {
  task_state?: PhysicalTaskState;
  observed_evidence: PhysicalEvidenceItem[];
  next_actions: PhysicalNextAction[];
  safety_notes: PhysicalSafetyNote[];
  follow_up_suggestions: string[];
  visual_annotations: PhysicalVisualAnnotation[];
}

export type VisualGuidanceCardKind =
  | 'goal'
  | 'image_index'
  | 'materials'
  | 'plan'
  | 'active_step'
  | 'check'
  | 'mistake'
  | 'difference'
  | 'progress'
  | 'confidence'
  | 'safety'
  | 'choice'
  | 'comparison'
  | 'note';

export type VisualGuidanceOverlayType =
  | 'label'
  | 'box'
  | 'circle'
  | 'arrow'
  | 'line'
  | 'path'
  | 'number'
  | 'spotlight'
  | 'mask'
  | 'ghost'
  | 'check'
  | 'warning';

export interface VisualGuidancePoint {
  x: number;
  y: number;
}

export interface VisualGuidanceSceneItem {
  item_id: string;
  display_number?: number;
  name: string;
  role?: string;
  image_id?: string;
  point?: VisualGuidancePoint;
  bbox?: { x: number; y: number; width: number; height: number };
  confidence?: string;
}

export interface VisualGuidanceOverlay {
  id: string;
  type: VisualGuidanceOverlayType;
  image_id?: string;
  item_id?: string;
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  from?: VisualGuidancePoint;
  to?: VisualGuidancePoint;
  points?: VisualGuidancePoint[];
  sequence?: number;
  confidence?: string;
}

export interface VisualGuidanceCard {
  id: string;
  kind: VisualGuidanceCardKind;
  title: string;
  body?: string;
  image_id?: string;
  related_item_ids: string[];
  step_number?: number;
  status?: string;
}

export interface VisualGuidanceDifference {
  id: string;
  image_id?: string;
  title: string;
  detail?: string;
  severity?: string;
  related_item_ids: string[];
}

export interface VisualGuidanceResponse {
  primary_image_id?: string;
  active_card_id?: string;
  current_state?: string;
  next_target_state?: string;
  scene_items: VisualGuidanceSceneItem[];
  overlays: VisualGuidanceOverlay[];
  cards: VisualGuidanceCard[];
  differences: VisualGuidanceDifference[];
}

const CHART_KINDS = new Set<ChartKind>(['bar', 'line', 'pie', 'area']);

const CHART_SERIES_SCHEMA = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    color: { type: 'string' },
  },
  required: ['key', 'label'],
} as const;

const CHART_DATA_ROW_SCHEMA = {
  type: 'object',
  minProperties: 1,
} as const;

const CHART_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    kind: { type: 'string', enum: ['bar', 'line', 'pie', 'area'] },
    xKey: { type: 'string' },
    nameKey: { type: 'string' },
    valueKey: { type: 'string' },
    series: { type: 'array', minItems: 1, items: CHART_SERIES_SCHEMA },
    data: { type: 'array', minItems: 1, items: CHART_DATA_ROW_SCHEMA },
  },
  required: ['id', 'title', 'kind', 'series', 'data'],
} as const;

const VISUAL_IMAGE_GROUP_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    intent: { type: 'string', enum: STOCK_IMAGE_INTENTS },
    layout: { type: 'string', enum: STOCK_IMAGE_LAYOUTS },
    placement: { type: 'string' },
    queries: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_STOCK_IMAGE_QUERIES_PER_GROUP,
      items: { type: 'string' },
    },
    maxItems: { type: 'integer', minimum: 1, maximum: 6 },
  },
  required: ['id', 'title', 'intent', 'layout', 'queries'],
} as const;

const TASK_STATE_SCHEMA = {
  type: 'object',
  properties: {
    task: { type: 'string' },
    stage: { type: 'string' },
    progress: { type: 'string' },
    confidence: { type: 'string' },
  },
} as const;

const OBSERVED_EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    source: { type: 'string' },
    confidence: { type: 'string' },
  },
  required: ['text'],
} as const;

const NEXT_ACTION_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    detail: { type: 'string' },
    why: { type: 'string' },
    check: { type: 'string' },
    example: { type: 'string' },
  },
  required: ['title'],
} as const;

const SAFETY_NOTE_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    severity: { type: 'string' },
    stopCondition: { type: 'string' },
  },
  required: ['message'],
} as const;

const BOX_2D_SCHEMA = {
  type: 'array',
  minItems: 4,
  maxItems: 4,
  items: { type: 'integer', minimum: 0, maximum: 1000 },
} as const;

const VISUAL_ANNOTATION_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    image_id: { type: 'string' },
    box_2d: BOX_2D_SCHEMA,
    confidence: { type: 'string' },
  },
  required: ['label'],
} as const;

const GUIDANCE_FREEFORM_OBJECT_SCHEMA = {
  type: 'object',
} as const;

const VISUAL_GUIDANCE_SCHEMA = {
  type: 'object',
  properties: {
    primary_image_id: { type: 'string' },
    active_card_id: { type: 'string' },
    current_state: { type: 'string' },
    next_target_state: { type: 'string' },
    scene_items: { type: 'array', items: GUIDANCE_FREEFORM_OBJECT_SCHEMA },
    overlays: { type: 'array', items: GUIDANCE_FREEFORM_OBJECT_SCHEMA },
    cards: { type: 'array', items: GUIDANCE_FREEFORM_OBJECT_SCHEMA },
    differences: { type: 'array', items: GUIDANCE_FREEFORM_OBJECT_SCHEMA },
  },
} as const;

const PHYSICAL_TASK_SCHEMA = {
  type: 'object',
  properties: {
    task_state: TASK_STATE_SCHEMA,
    observed_evidence: { type: 'array', maxItems: 8, items: OBSERVED_EVIDENCE_SCHEMA },
    next_actions: { type: 'array', maxItems: 8, items: NEXT_ACTION_SCHEMA },
    safety_notes: { type: 'array', maxItems: 5, items: SAFETY_NOTE_SCHEMA },
    follow_up_suggestions: { type: 'array', maxItems: 4, items: { type: 'string' } },
    visual_annotations: { type: 'array', maxItems: 8, items: VISUAL_ANNOTATION_SCHEMA },
  },
} as const;

export const VOICE_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    needs_visual_explanation: { type: 'boolean' },
    explanation_text: { type: 'string' },
    spoken_transcript: { type: 'string' },
    delivery_tag: { type: 'string' },
    charts: { type: 'array', items: CHART_SCHEMA },
    physical_task: PHYSICAL_TASK_SCHEMA,
    visual_guidance: VISUAL_GUIDANCE_SCHEMA,
    guidance_mode: { type: 'string' },
    live_guide: GUIDANCE_FREEFORM_OBJECT_SCHEMA,
    visual_image_groups: {
      type: 'array',
      maxItems: MAX_STOCK_IMAGE_GROUPS,
      items: VISUAL_IMAGE_GROUP_SCHEMA,
    },
  },
  required: ['needs_visual_explanation', 'explanation_text', 'spoken_transcript', 'delivery_tag'],
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function parseChartSeries(raw: unknown, chartIndex: number, seriesIndex: number): ChartSeries | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const key = typeof record.key === 'string' ? record.key.trim() : '';
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!key || !label) {
    return null;
  }

  const color =
    typeof record.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(record.color.trim())
      ? record.color.trim()
      : CHART_PALETTE[(chartIndex + seriesIndex) % CHART_PALETTE.length];

  return { key, label, color };
}

function coerceDataRow(raw: unknown): Record<string, string | number> | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const row: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      row[key] = value;
    } else if (typeof value === 'string') {
      row[key] = value.trim();
    }
  }

  return Object.keys(row).length > 0 ? row : null;
}

function parseChart(raw: unknown, index: number): ChartSpec | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const kindRaw = typeof record.kind === 'string' ? record.kind.trim() : '';
  if (!CHART_KINDS.has(kindRaw as ChartKind)) {
    return null;
  }

  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!title) {
    return null;
  }

  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `chart-${index + 1}`;
  const description =
    typeof record.description === 'string' ? normalizeExplanationMarkdown(record.description) : undefined;

  const seriesRaw = Array.isArray(record.series) ? record.series : [];
  const series = seriesRaw
    .map((item, seriesIndex) => parseChartSeries(item, index, seriesIndex))
    .filter((item): item is ChartSeries => item !== null);

  if (series.length === 0) {
    return null;
  }

  const dataRaw = Array.isArray(record.data) ? record.data : [];
  const data = dataRaw
    .slice(0, MAX_CHART_ROWS)
    .map((row) => coerceDataRow(row))
    .filter((row): row is Record<string, string | number> => row !== null);

  if (data.length === 0) {
    return null;
  }

  const xKey = typeof record.xKey === 'string' ? record.xKey.trim() : undefined;
  const nameKey = typeof record.nameKey === 'string' ? record.nameKey.trim() : undefined;
  const valueKey = typeof record.valueKey === 'string' ? record.valueKey.trim() : undefined;

  return {
    id,
    title,
    kind: kindRaw as ChartKind,
    series,
    data,
    ...(description ? { description } : {}),
    ...(xKey ? { xKey } : {}),
    ...(nameKey ? { nameKey } : {}),
    ...(valueKey ? { valueKey } : {}),
  };
}

function parseCharts(raw: unknown): ChartSpec[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .slice(0, MAX_CHARTS)
    .map((item, index) => parseChart(item, index))
    .filter((chart): chart is ChartSpec => chart !== null);
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseTaskState(raw: unknown): PhysicalTaskState | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const task = cleanString(record.task);
  const stage = cleanString(record.stage);
  const progress = cleanString(record.progress);
  const confidence = cleanString(record.confidence);

  if (!task && !stage && !progress && !confidence) return undefined;

  return {
    ...(task ? { task } : {}),
    ...(stage ? { stage } : {}),
    ...(progress ? { progress } : {}),
    ...(confidence ? { confidence } : {}),
  };
}

function parseEvidenceItems(raw: unknown): PhysicalEvidenceItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 8)
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;

      const text = cleanString(record.text);
      if (!text) return null;

      const source = cleanString(record.source);
      const confidence = cleanString(record.confidence);
      return {
        text,
        ...(source ? { source } : {}),
        ...(confidence ? { confidence } : {}),
      } satisfies PhysicalEvidenceItem;
    })
    .filter((item): item is PhysicalEvidenceItem => item !== null);
}

function parseNextActions(raw: unknown): PhysicalNextAction[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 8)
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;

      const title = cleanString(record.title);
      if (!title) return null;

      const detail = cleanString(record.detail);
      const why = cleanString(record.why);
      const check = cleanString(record.check);
      const example = cleanString(record.example);
      return {
        title,
        ...(detail ? { detail: normalizeExplanationMarkdown(detail) } : {}),
        ...(why ? { why: normalizeExplanationMarkdown(why) } : {}),
        ...(check ? { check: normalizeExplanationMarkdown(check) } : {}),
        ...(example ? { example: normalizeExplanationMarkdown(example) } : {}),
      } satisfies PhysicalNextAction;
    })
    .filter((item): item is PhysicalNextAction => item !== null);
}

function parseSafetyNotes(raw: unknown): PhysicalSafetyNote[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 5)
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;

      const message = cleanString(record.message);
      if (!message) return null;

      const severity = cleanString(record.severity);
      const stopCondition = cleanString(record.stopCondition);
      return {
        message: normalizeExplanationMarkdown(message),
        ...(severity ? { severity } : {}),
        ...(stopCondition ? { stopCondition: normalizeExplanationMarkdown(stopCondition) } : {}),
      } satisfies PhysicalSafetyNote;
    })
    .filter((item): item is PhysicalSafetyNote => item !== null);
}

function parseFollowUpSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(cleanString).filter(Boolean).slice(0, 4);
}

function parseNormalizedCoordinate(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return undefined;
  }
  return value;
}

function requiresImageId(options?: VoiceResponseParseOptions): boolean {
  return (options?.imageIds?.length ?? 0) > 1;
}

function resolveImageId(raw: unknown, options?: VoiceResponseParseOptions): string | undefined {
  const imageId = cleanString(raw);
  if (!imageId) {
    return requiresImageId(options) ? undefined : options?.imageIds?.[0];
  }
  if (options?.imageIds && options.imageIds.length > 0 && !options.imageIds.includes(imageId)) {
    return undefined;
  }
  return imageId;
}

/** Converts Gemini-native [y_min, x_min, y_max, x_max] (0-1000) to normalized 0-1 x/y/width/height. */
function parseBox2d(raw: unknown): { x: number; y: number; width: number; height: number } | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;

  const coords = raw.map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : NaN));
  if (coords.some((value) => Number.isNaN(value) || value < 0 || value > 1000)) {
    return undefined;
  }

  const [yMin, xMin, yMax, xMax] = coords;
  if (yMax <= yMin || xMax <= xMin) return undefined;

  return {
    x: xMin / 1000,
    y: yMin / 1000,
    width: (xMax - xMin) / 1000,
    height: (yMax - yMin) / 1000,
  };
}

function parseLegacyBbox(record: Record<string, unknown>): { x: number; y: number; width: number; height: number } | undefined {
  const x = parseNormalizedCoordinate(record.x);
  const y = parseNormalizedCoordinate(record.y);
  const width = parseNormalizedCoordinate(record.width);
  const height = parseNormalizedCoordinate(record.height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }

  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

function parseSpatialBbox(record: Record<string, unknown>): { x: number; y: number; width: number; height: number } | undefined {
  return parseBox2d(record.box_2d) ?? parseLegacyBbox(record);
}

function parseDisplayNumber(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return undefined;
  return Math.min(Math.max(raw, 1), 99);
}

/** Fills missing display_number on scene items, grouped by image_id. */
function assignSceneItemDisplayNumbers(items: VisualGuidanceSceneItem[]): VisualGuidanceSceneItem[] {
  const groups = new Map<string, VisualGuidanceSceneItem[]>();

  for (const item of items) {
    const key = item.image_id ?? '__default__';
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const result: VisualGuidanceSceneItem[] = [];

  for (const group of groups.values()) {
    const used = new Set(
      group.map((item) => item.display_number).filter((n): n is number => n !== undefined),
    );
    let next = 1;

    for (const item of group) {
      if (item.display_number !== undefined) {
        result.push(item);
        continue;
      }

      while (used.has(next) && next <= 99) {
        next += 1;
      }

      const display_number = next <= 99 ? next : undefined;
      if (display_number !== undefined) {
        used.add(display_number);
        next += 1;
      }

      result.push({
        ...item,
        ...(display_number !== undefined ? { display_number } : {}),
      });
    }
  }

  return result;
}

function assignAnnotationDisplayNumbers(
  annotations: PhysicalVisualAnnotation[],
): PhysicalVisualAnnotation[] {
  const groups = new Map<string, PhysicalVisualAnnotation[]>();

  for (const annotation of annotations) {
    const key = annotation.image_id ?? '__default__';
    const group = groups.get(key) ?? [];
    group.push(annotation);
    groups.set(key, group);
  }

  const result: PhysicalVisualAnnotation[] = [];

  for (const group of groups.values()) {
    const used = new Set(
      group.map((item) => item.display_number).filter((n): n is number => n !== undefined),
    );
    let next = 1;

    for (const annotation of group) {
      if (annotation.display_number !== undefined) {
        result.push(annotation);
        continue;
      }

      while (used.has(next) && next <= 99) {
        next += 1;
      }

      const display_number = next <= 99 ? next : undefined;
      if (display_number !== undefined) {
        used.add(display_number);
        next += 1;
      }

      result.push({
        ...annotation,
        ...(display_number !== undefined ? { display_number } : {}),
      });
    }
  }

  return result;
}

function parseVisualAnnotations(raw: unknown, options?: VoiceResponseParseOptions): PhysicalVisualAnnotation[] {
  if (!Array.isArray(raw)) return [];

  const parsed = raw
    .slice(0, 8)
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;

      const label = cleanString(record.label);
      if (!label) return null;

      const imageId = resolveImageId(record.image_id, options);
      if (requiresImageId(options) && !imageId) return null;

      const displayNumber = parseDisplayNumber(record.display_number);
      const bbox = parseSpatialBbox(record);
      const confidence = cleanString(record.confidence);

      return {
        label,
        ...(displayNumber !== undefined ? { display_number: displayNumber } : {}),
        ...(imageId ? { image_id: imageId } : {}),
        ...(bbox ? { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height } : {}),
        ...(confidence ? { confidence } : {}),
      } satisfies PhysicalVisualAnnotation;
    })
    .filter((item): item is PhysicalVisualAnnotation => item !== null);

  return assignAnnotationDisplayNumbers(parsed);
}

function parsePoint(raw: unknown): VisualGuidancePoint | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const x = parseNormalizedCoordinate(record.x);
  const y = parseNormalizedCoordinate(record.y);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

function parseGuidanceBbox(
  raw: unknown,
): { x: number; y: number; width: number; height: number } | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  return parseSpatialBbox(record);
}

function parseStringArray(raw: unknown, maxItems: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(cleanString).filter(Boolean).slice(0, maxItems);
}

const GUIDANCE_CARD_KINDS = new Set<VisualGuidanceCardKind>([
  'goal',
  'image_index',
  'materials',
  'plan',
  'active_step',
  'check',
  'mistake',
  'difference',
  'progress',
  'confidence',
  'safety',
  'choice',
  'comparison',
  'note',
]);

const GUIDANCE_OVERLAY_TYPES = new Set<VisualGuidanceOverlayType>([
  'label',
  'box',
  'circle',
  'arrow',
  'line',
  'path',
  'number',
  'spotlight',
  'mask',
  'ghost',
  'check',
  'warning',
]);

function parseGuidanceSceneItems(raw: unknown, options?: VoiceResponseParseOptions): VisualGuidanceSceneItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 24)
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;

      const name = cleanString(record.name);
      if (!name) return null;

      const imageId = resolveImageId(record.image_id, options);
      if (requiresImageId(options) && !imageId) return null;

      const itemId = cleanString(record.item_id) || `item-${index + 1}`;
      const displayNumber = parseDisplayNumber(record.display_number);
      const role = cleanString(record.role);
      const confidence = cleanString(record.confidence);
      const bbox = parseGuidanceBbox(record.bbox) ?? parseSpatialBbox(record);

      return {
        item_id: itemId,
        ...(displayNumber !== undefined ? { display_number: displayNumber } : {}),
        name,
        ...(role ? { role } : {}),
        ...(imageId ? { image_id: imageId } : {}),
        ...(parsePoint(record.point) ? { point: parsePoint(record.point) } : {}),
        ...(bbox ? { bbox } : {}),
        ...(confidence ? { confidence } : {}),
      } satisfies VisualGuidanceSceneItem;
    })
    .filter((item): item is VisualGuidanceSceneItem => item !== null);
}

const OVERLAY_TYPES_REQUIRING_LABEL = new Set<VisualGuidanceOverlayType>(['label', 'box', 'number', 'warning']);

function parseGuidanceOverlays(raw: unknown, options?: VoiceResponseParseOptions): VisualGuidanceOverlay[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 32)
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;

      const type = cleanString(record.type);
      if (!GUIDANCE_OVERLAY_TYPES.has(type as VisualGuidanceOverlayType)) {
        return null;
      }

      const overlayType = type as VisualGuidanceOverlayType;
      const id = cleanString(record.id) || `overlay-${index + 1}`;
      const imageId = resolveImageId(record.image_id, options);
      if (requiresImageId(options) && !imageId) return null;

      const itemId = cleanString(record.item_id);
      const label = cleanString(record.label);
      if (OVERLAY_TYPES_REQUIRING_LABEL.has(overlayType) && !label) return null;

      const confidence = cleanString(record.confidence);
      const sequence =
        typeof record.sequence === 'number' && Number.isFinite(record.sequence)
          ? Math.min(Math.max(Math.round(record.sequence), 0), 100)
          : undefined;
      const points = Array.isArray(record.points)
        ? record.points.map(parsePoint).filter((point): point is VisualGuidancePoint => Boolean(point)).slice(0, 24)
        : undefined;
      const spatial = parseSpatialBbox(record);

      return {
        id,
        type: overlayType,
        ...(imageId ? { image_id: imageId } : {}),
        ...(itemId ? { item_id: itemId } : {}),
        ...(label ? { label } : {}),
        ...(spatial ? { x: spatial.x, y: spatial.y, width: spatial.width, height: spatial.height } : {}),
        ...(parsePoint(record.from) ? { from: parsePoint(record.from) } : {}),
        ...(parsePoint(record.to) ? { to: parsePoint(record.to) } : {}),
        ...(points && points.length >= 2 ? { points } : {}),
        ...(sequence !== undefined ? { sequence } : {}),
        ...(confidence ? { confidence } : {}),
      } satisfies VisualGuidanceOverlay;
    })
    .filter((item): item is VisualGuidanceOverlay => item !== null);
}

function parseGuidanceCards(raw: unknown, options?: VoiceResponseParseOptions): VisualGuidanceCard[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 16)
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;

      const kind = cleanString(record.kind);
      if (!GUIDANCE_CARD_KINDS.has(kind as VisualGuidanceCardKind)) {
        return null;
      }

      const title = cleanString(record.title);
      if (!title) return null;

      const id = cleanString(record.id) || `card-${index + 1}`;
      const body = cleanString(record.body);
      const imageId = resolveImageId(record.image_id, options);
      if (requiresImageId(options) && !imageId) return null;

      const status = cleanString(record.status);
      const stepNumber =
        typeof record.step_number === 'number' && Number.isInteger(record.step_number)
          ? Math.min(Math.max(record.step_number, 1), 99)
          : undefined;

      return {
        id,
        kind: kind as VisualGuidanceCardKind,
        title,
        ...(body ? { body: normalizeExplanationMarkdown(body) } : {}),
        ...(imageId ? { image_id: imageId } : {}),
        related_item_ids: parseStringArray(record.related_item_ids, 12),
        ...(stepNumber !== undefined ? { step_number: stepNumber } : {}),
        ...(status ? { status } : {}),
      } satisfies VisualGuidanceCard;
    })
    .filter((item): item is VisualGuidanceCard => item !== null);
}

function parseGuidanceDifferences(raw: unknown, options?: VoiceResponseParseOptions): VisualGuidanceDifference[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 12)
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;

      const title = cleanString(record.title);
      if (!title) return null;

      const id = cleanString(record.id) || `difference-${index + 1}`;
      const imageId = resolveImageId(record.image_id, options);
      if (requiresImageId(options) && !imageId) return null;

      const detail = cleanString(record.detail);
      const severity = cleanString(record.severity);

      return {
        id,
        ...(imageId ? { image_id: imageId } : {}),
        title,
        ...(detail ? { detail: normalizeExplanationMarkdown(detail) } : {}),
        ...(severity ? { severity } : {}),
        related_item_ids: parseStringArray(record.related_item_ids, 12),
      } satisfies VisualGuidanceDifference;
    })
    .filter((item): item is VisualGuidanceDifference => item !== null);
}

export function parseVisualGuidance(
  raw: unknown,
  options?: VoiceResponseParseOptions,
): VisualGuidanceResponse | null {
  const record = asRecord(raw);
  if (!record) return null;

  const sceneItems = assignSceneItemDisplayNumbers(parseGuidanceSceneItems(record.scene_items, options));
  const overlays = parseGuidanceOverlays(record.overlays, options);
  const cards = parseGuidanceCards(record.cards, options);
  const differences = parseGuidanceDifferences(record.differences, options);
  const currentState = cleanString(record.current_state);
  const nextTargetState = cleanString(record.next_target_state);
  const primaryImageId = cleanString(record.primary_image_id);
  const activeCardId = cleanString(record.active_card_id);

  if (
    sceneItems.length === 0 &&
    overlays.length === 0 &&
    cards.length === 0 &&
    differences.length === 0 &&
    !currentState &&
    !nextTargetState
  ) {
    return null;
  }

  return {
    ...(primaryImageId ? { primary_image_id: primaryImageId } : {}),
    ...(activeCardId ? { active_card_id: activeCardId } : {}),
    ...(currentState ? { current_state: normalizeExplanationMarkdown(currentState) } : {}),
    ...(nextTargetState ? { next_target_state: normalizeExplanationMarkdown(nextTargetState) } : {}),
    scene_items: sceneItems,
    overlays,
    cards,
    differences,
  };
}

const LIVE_GUIDE_DIRECTIVE_KINDS = new Set<LiveGuideDirectiveKind>([
  'pointer',
  'path',
  'region',
  'ghost',
]);

const LIVE_GUIDE_EMPHASES = new Set<LiveGuideEmphasis>(['primary', 'secondary', 'warning']);

/**
 * Accepts the model's native 0-1000 spatial convention as well as already
 * normalized 0-1 floats and returns a normalized 0-1 value.
 */
function normalizeLiveGuideCoordinate(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  if (value <= 1) {
    return value;
  }
  if (value <= 1000) {
    return value / 1000;
  }
  return undefined;
}

function parseLiveGuidePoints(raw: unknown): VisualGuidancePoint[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 24)
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const x = normalizeLiveGuideCoordinate(record.x);
      const y = normalizeLiveGuideCoordinate(record.y);
      return x !== undefined && y !== undefined ? { x, y } : null;
    })
    .filter((point): point is VisualGuidancePoint => point !== null);
}

function parseLiveGuideDirectives(raw: unknown): LiveGuideDirective[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 8)
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;

      const kind = cleanString(record.kind);
      if (!LIVE_GUIDE_DIRECTIVE_KINDS.has(kind as LiveGuideDirectiveKind)) {
        return null;
      }

      const points = parseLiveGuidePoints(record.points);
      if (points.length === 0) return null;
      if ((kind === 'path' || kind === 'ghost') && points.length < 2) return null;

      const id = cleanString(record.id) || `guide-${index + 1}`;
      const label = cleanString(record.label);
      const detail = cleanString(record.detail);
      const emphasisRaw = cleanString(record.emphasis);
      const emphasis = LIVE_GUIDE_EMPHASES.has(emphasisRaw as LiveGuideEmphasis)
        ? (emphasisRaw as LiveGuideEmphasis)
        : undefined;
      const sequence =
        typeof record.sequence === 'number' && Number.isFinite(record.sequence)
          ? Math.min(Math.max(Math.round(record.sequence), 0), 100)
          : undefined;

      return {
        id,
        kind: kind as LiveGuideDirectiveKind,
        points,
        ...(label ? { label } : {}),
        ...(detail ? { detail } : {}),
        ...(emphasis ? { emphasis } : {}),
        ...(sequence !== undefined ? { sequence } : {}),
      } satisfies LiveGuideDirective;
    })
    .filter((directive): directive is LiveGuideDirective => directive !== null);
}

export function parseGuidanceMode(raw: unknown): GuidanceMode {
  return raw === 'live_recommended' || raw === 'live_requested' ? raw : 'static';
}

export function parseLiveGuide(raw: unknown): LiveGuideResponse | null {
  const record = asRecord(raw);
  if (!record) return null;

  const directives = parseLiveGuideDirectives(record.directives);
  const coachingNote = cleanString(record.coaching_note);
  const interjectionRecord = asRecord(record.interjection);
  const interjection: LiveGuideInterjection | undefined = interjectionRecord
    ? {
        should_speak: Boolean(interjectionRecord.should_speak),
        ...(cleanString(interjectionRecord.urgency)
          ? { urgency: cleanString(interjectionRecord.urgency) }
          : {}),
      }
    : undefined;
  const taskRecord = asRecord(record.task);
  const task: LiveGuideTaskState | undefined = taskRecord
    ? {
        ...(cleanString(taskRecord.name) ? { name: cleanString(taskRecord.name) } : {}),
        ...(cleanString(taskRecord.stage) ? { stage: cleanString(taskRecord.stage) } : {}),
        ...(cleanString(taskRecord.progress) ? { progress: cleanString(taskRecord.progress) } : {}),
      }
    : undefined;
  const hasTask = task && Object.keys(task).length > 0;

  if (directives.length === 0 && !coachingNote && !interjection && !hasTask) {
    return null;
  }

  return {
    directives,
    clear_previous: record.clear_previous !== false,
    ...(coachingNote ? { coaching_note: coachingNote } : {}),
    ...(interjection ? { interjection } : {}),
    ...(hasTask ? { task } : {}),
  };
}

function parsePhysicalTask(raw: unknown, options?: VoiceResponseParseOptions): PhysicalTaskResponse | null {
  const record = asRecord(raw);
  if (!record) return null;

  const taskState = parseTaskState(record.task_state);
  const observedEvidence = parseEvidenceItems(record.observed_evidence);
  const nextActions = parseNextActions(record.next_actions);
  const safetyNotes = parseSafetyNotes(record.safety_notes);
  const followUpSuggestions = parseFollowUpSuggestions(record.follow_up_suggestions);
  const visualAnnotations = parseVisualAnnotations(record.visual_annotations, options);

  const hasContent =
    taskState ||
    observedEvidence.length > 0 ||
    nextActions.length > 0 ||
    safetyNotes.length > 0 ||
    followUpSuggestions.length > 0 ||
    visualAnnotations.length > 0;

  if (!hasContent) return null;

  return {
    ...(taskState ? { task_state: taskState } : {}),
    observed_evidence: observedEvidence,
    next_actions: nextActions,
    safety_notes: safetyNotes,
    follow_up_suggestions: followUpSuggestions,
    visual_annotations: visualAnnotations,
  };
}

function parseJsonResponse(raw: string): unknown {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error('Response model returned invalid JSON.');
  }
}

function buildVoiceResponsePayload(
  record: Record<string, unknown>,
  options?: VoiceResponseParseOptions,
): VoiceResponsePayload {
  const charts = parseCharts(record.charts);
  const visualImageGroups = parseVisualImageGroupRequests(record.visual_image_groups);
  const physicalTask = parsePhysicalTask(record.physical_task, options);
  const visualGuidance = parseVisualGuidance(record.visual_guidance, options);
  const liveGuide = parseLiveGuide(record.live_guide);

  return {
    needs_visual_explanation:
      Boolean(record.needs_visual_explanation) ||
      charts.length > 0 ||
      physicalTask !== null ||
      visualGuidance !== null,
    explanation_text:
      typeof record.explanation_text === 'string' ? normalizeExplanationMarkdown(record.explanation_text) : '',
    spoken_transcript: typeof record.spoken_transcript === 'string' ? record.spoken_transcript.trim() : '',
    delivery_tag: typeof record.delivery_tag === 'string' ? record.delivery_tag.trim() : '[friendly]',
    charts,
    visual_image_groups: visualImageGroups,
    physical_task: physicalTask,
    visual_guidance: visualGuidance,
    guidance_mode: parseGuidanceMode(record.guidance_mode),
    live_guide: liveGuide,
  };
}

export function parseVoiceResponsePayloadWithRaw(
  raw: string,
  options?: VoiceResponseParseOptions,
): {
  payload: VoiceResponsePayload;
  rawRecord: Record<string, unknown>;
} {
  let parsed: unknown;

  try {
    parsed = parseJsonResponse(raw);
  } catch {
    throw new Error('Response model returned invalid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Response model returned invalid JSON.');
  }

  const rawRecord = parsed as Record<string, unknown>;
  return {
    payload: buildVoiceResponsePayload(rawRecord, options),
    rawRecord,
  };
}

export function parseVoiceResponsePayload(
  raw: string,
  options?: VoiceResponseParseOptions,
): VoiceResponsePayload {
  return parseVoiceResponsePayloadWithRaw(raw, options).payload;
}

export { normalizeExplanationMarkdown, sanitizeExplanationText } from '@/lib/format/explanation-markdown';

export function buildTtsPromptFromPayload(payload: VoiceResponsePayload): string {
  const tag = payload.delivery_tag || '[friendly]';
  const transcript = payload.spoken_transcript.trim();

  if (!transcript) {
    throw new Error('Response model returned an empty spoken transcript.');
  }

  return `Synthesize the following speech performance.

# AUDIO PROFILE: Chrysty
## "Adaptive Voice Companion"

## THE SCENE: A calm, focused conversation space. The assistant listens carefully and responds naturally.

### DIRECTOR'S NOTES
Style: Warm, attentive, matching the user's energy and language.
Pacing: Natural conversational pace.
Accent: Same language as the user.
Voice: ${getGeminiTtsVoice()}

#### TRANSCRIPT
${tag} ${transcript}`;
}

export function chunkExplanationText(text: string, chunkSize = 32): string[] {
  if (!text) return [];

  const chunks: string[] = [];
  let index = 0;

  while (index < text.length) {
    chunks.push(text.slice(index, index + chunkSize));
    index += chunkSize;
  }

  return chunks;
}
