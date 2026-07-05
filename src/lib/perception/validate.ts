import type {
  DetectorHealth,
  PerceptionEvent,
  PerceptionMemorySummary,
  PerceptionObservation,
  PerceptionProfileId,
  PerceptionSnapshot,
  SceneState,
} from './types';

const MAX_OBSERVATIONS_PER_GROUP = 12;
const MAX_EVENTS = 20;
const MAX_HEALTH = 20;
const MAX_TEXT_LENGTH = 500;

const PROFILES = new Set<PerceptionProfileId>([
  'general',
  'reading',
  'shopping',
  'cooking',
  'workout',
  'navigation',
  'accessibility',
  'diy',
  'memory_assist',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function confidenceValue(value: unknown): number {
  const parsed = numberValue(value, 0);
  return Math.max(0, Math.min(1, parsed));
}

function sanitizeObservation(value: unknown): PerceptionObservation | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = stringValue(record.id);
  const kind = stringValue(record.kind) as PerceptionObservation['kind'];
  const capability = stringValue(record.capability) as PerceptionObservation['capability'];
  const label = stringValue(record.label);
  const source = stringValue(record.source, capability);
  const observedAt = stringValue(record.observedAt, new Date().toISOString());

  if (!id || !kind || !capability || !label) return null;

  return {
    id,
    kind,
    capability,
    label,
    source,
    observedAt,
    confidence: confidenceValue(record.confidence),
    ...(typeof record.frameId === 'string' ? { frameId: stringValue(record.frameId) } : {}),
    ...(typeof record.text === 'string' ? { text: stringValue(record.text) } : {}),
    ...(typeof record.value === 'string' ? { value: stringValue(record.value) } : {}),
    ...(typeof record.format === 'string' ? { format: stringValue(record.format, 'code') } : {}),
  };
}

function sanitizeObservationArray(value: unknown): PerceptionObservation[] {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeObservation).filter((item): item is PerceptionObservation => item !== null).slice(0, MAX_OBSERVATIONS_PER_GROUP);
}

function sanitizeScene(value: unknown): SceneState {
  const record = asRecord(value) ?? {};
  return {
    objects: sanitizeObservationArray(record.objects),
    text: sanitizeObservationArray(record.text),
    codes: sanitizeObservationArray(record.codes),
    people: sanitizeObservationArray(record.people),
    hands: sanitizeObservationArray(record.hands),
    gestures: sanitizeObservationArray(record.gestures),
    ...(typeof record.summary === 'string' ? { summary: stringValue(record.summary) } : {}),
    lastUpdated: stringValue(record.lastUpdated, new Date().toISOString()),
  };
}

function sanitizeEvent(value: unknown): PerceptionEvent | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = stringValue(record.id);
  const type = stringValue(record.type) as PerceptionEvent['type'];
  const label = stringValue(record.label);
  const occurredAt = stringValue(record.occurredAt, new Date().toISOString());
  if (!id || !type || !label) return null;

  return {
    id,
    type,
    label,
    occurredAt,
    confidence: confidenceValue(record.confidence),
    ...(typeof record.capability === 'string'
      ? { capability: stringValue(record.capability) as PerceptionEvent['capability'] }
      : {}),
    ...(typeof record.summary === 'string' ? { summary: stringValue(record.summary) } : {}),
  };
}

function sanitizeMemory(value: unknown): PerceptionMemorySummary | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const rawLastSeen = Array.isArray(record.lastSeen) ? record.lastSeen : [];
  const lastSeen = rawLastSeen
    .map((item) => {
      const itemRecord = asRecord(item);
      if (!itemRecord) return null;
      const label = stringValue(itemRecord.label);
      const kind = stringValue(itemRecord.kind) as PerceptionObservation['kind'];
      if (!label || !kind) return null;
      return {
        label,
        kind,
        lastSeenAt: stringValue(itemRecord.lastSeenAt, new Date().toISOString()),
        summary: stringValue(itemRecord.summary, `${label} was seen recently.`),
        confidence: confidenceValue(itemRecord.confidence),
      };
    })
    .filter((item): item is PerceptionMemorySummary['lastSeen'][number] => item !== null)
    .slice(-8);

  const recentChanges = (Array.isArray(record.recentChanges) ? record.recentChanges : [])
    .map(sanitizeEvent)
    .filter((item): item is PerceptionEvent => item !== null)
    .slice(-8);

  return { lastSeen, recentChanges };
}

function sanitizeHealth(value: unknown): DetectorHealth | null {
  const record = asRecord(value);
  if (!record) return null;
  const detectorId = stringValue(record.detectorId);
  const capability = stringValue(record.capability) as DetectorHealth['capability'];
  const status = stringValue(record.status) as DetectorHealth['status'];
  const label = stringValue(record.label);
  if (!detectorId || !capability || !status || !label) return null;

  return {
    detectorId,
    capability,
    status,
    label,
    updatedAt: stringValue(record.updatedAt, new Date().toISOString()),
    ...(typeof record.message === 'string' ? { message: stringValue(record.message) } : {}),
    ...(typeof record.averageLatencyMs === 'number' ? { averageLatencyMs: numberValue(record.averageLatencyMs) } : {}),
  };
}

export function sanitizePerceptionSnapshot(value: unknown): PerceptionSnapshot | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const rawProfile = stringValue(record.profile) as PerceptionProfileId;
  const profile = PROFILES.has(rawProfile) ? rawProfile : 'general';
  const events = (Array.isArray(record.events) ? record.events : [])
    .map(sanitizeEvent)
    .filter((item): item is PerceptionEvent => item !== null)
    .slice(-MAX_EVENTS);
  const detectorHealth = (Array.isArray(record.detectorHealth) ? record.detectorHealth : [])
    .map(sanitizeHealth)
    .filter((item): item is DetectorHealth => item !== null)
    .slice(-MAX_HEALTH);

  return {
    version: 1,
    profile,
    capturedAt: stringValue(record.capturedAt, new Date().toISOString()),
    scene: sanitizeScene(record.scene),
    events,
    ...(record.memory ? { memory: sanitizeMemory(record.memory) } : {}),
    detectorHealth,
  };
}

