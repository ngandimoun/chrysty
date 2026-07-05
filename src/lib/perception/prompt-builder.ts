import { getCapabilityLabel } from './capabilities';
import type { DetectorHealth, PerceptionEvent, PerceptionMemorySummary, PerceptionSnapshot, SceneState } from './types';

const MAX_OBJECTS = 8;
const MAX_TEXT = 5;
const MAX_CODES = 3;
const MAX_EVENTS = 8;
const MAX_MEMORY = 8;

export function buildPerceptionPromptBlock(snapshot?: PerceptionSnapshot): string {
  if (!snapshot) return '';

  const sections = [
    buildSceneBlock(snapshot.scene),
    buildEventsBlock(snapshot.events),
    buildMemoryBlock(snapshot.memory),
    buildDetectorAvailabilityBlock(snapshot.detectorHealth),
  ].filter(Boolean);

  if (sections.length === 0) return '';

  return [
    'Client perception context (structured hints from the user device; use as helpful signals, not as absolute truth):',
    ...sections,
  ].join('\n\n');
}

function confidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildSceneBlock(scene: SceneState): string {
  const lines = ['Current scene state:'];

  if (scene.summary) {
    lines.push(`- Summary: ${scene.summary}`);
  }

  for (const object of scene.objects.slice(0, MAX_OBJECTS)) {
    lines.push(`- Object: ${object.label} (${confidence(object.confidence)}, ${getCapabilityLabel(object.capability)})`);
  }

  for (const item of scene.text.slice(0, MAX_TEXT)) {
    const text = (item.text ?? item.label).replace(/\s+/g, ' ').trim();
    if (text) lines.push(`- Visible text: "${text}" (${confidence(item.confidence)})`);
  }

  for (const code of scene.codes.slice(0, MAX_CODES)) {
    lines.push(`- Scanned code: ${code.format ?? 'code'} detected (${confidence(code.confidence)})`);
  }

  if (scene.people.length > 0) {
    lines.push(`- People/face signals: ${scene.people.length}`);
  }
  if (scene.hands.length > 0) {
    lines.push(`- Hands visible: ${scene.hands.length}`);
  }
  if (scene.gestures.length > 0) {
    lines.push(`- Gestures: ${scene.gestures.map((item) => item.label).join(', ')}`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

function buildEventsBlock(events: PerceptionEvent[]): string {
  const meaningfulEvents = events
    .filter((event) => event.type !== 'nothing_important_changed')
    .slice(-MAX_EVENTS);

  if (meaningfulEvents.length === 0) return 'Recent perception events:\n- Nothing important changed.';

  return [
    'Recent perception events:',
    ...meaningfulEvents.map((event) => `- ${event.summary ?? event.label} (${confidence(event.confidence)})`),
  ].join('\n');
}

function buildMemoryBlock(memory?: PerceptionMemorySummary): string {
  if (!memory || (memory.lastSeen.length === 0 && memory.recentChanges.length === 0)) return '';

  const lines = ['Short-term visual memory:'];
  for (const item of memory.lastSeen.slice(-MAX_MEMORY)) {
    lines.push(`- ${item.summary} Last seen at ${item.lastSeenAt} (${confidence(item.confidence)}).`);
  }
  return lines.join('\n');
}

function buildDetectorAvailabilityBlock(health: DetectorHealth[]): string {
  const unavailable = health.filter((item) => item.status === 'failed' || item.status === 'degraded');
  if (unavailable.length === 0) return '';

  return [
    'Perception availability:',
    ...unavailable.map((item) => `- ${getCapabilityLabel(item.capability)} is ${item.status}.`),
  ].join('\n');
}

