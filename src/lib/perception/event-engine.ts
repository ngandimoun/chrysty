import type { PerceptionEvent, SceneState } from './types';

function labels(items: Array<{ label: string }>): Set<string> {
  return new Set(items.map((item) => item.label.toLowerCase()));
}

function eventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class EventEngine {
  private previous: SceneState | null = null;

  update(scene: SceneState): PerceptionEvent[] {
    const events: PerceptionEvent[] = [];
    const occurredAt = scene.lastUpdated;

    if (!this.previous) {
      this.previous = scene;
      return events;
    }

    const previousObjects = labels(this.previous.objects);
    const currentObjects = labels(scene.objects);

    for (const object of scene.objects) {
      if (!previousObjects.has(object.label.toLowerCase())) {
        events.push({
          id: eventId('object-entered'),
          type: 'object_entered',
          label: object.label,
          confidence: object.confidence,
          occurredAt,
          capability: object.capability,
          observationIds: [object.id],
          summary: `${object.label} appeared in the scene.`,
        });
      }
    }

    for (const object of this.previous.objects) {
      if (!currentObjects.has(object.label.toLowerCase())) {
        events.push({
          id: eventId('object-left'),
          type: 'object_left',
          label: object.label,
          confidence: object.confidence,
          occurredAt,
          capability: object.capability,
          observationIds: [object.id],
          summary: `${object.label} is no longer visible.`,
        });
      }
    }

    const previousText = this.previous.text.map((item) => item.text ?? item.label).join('\n');
    const currentText = scene.text.map((item) => item.text ?? item.label).join('\n');
    if (currentText && currentText !== previousText) {
      events.push({
        id: eventId('text-changed'),
        type: 'text_changed',
        label: 'Visible text changed',
        confidence: 0.8,
        occurredAt,
        capability: 'text_reader',
        observationIds: scene.text.map((item) => item.id),
        summary: 'Visible text changed.',
      });
    }

    for (const code of scene.codes) {
      const seenBefore = this.previous.codes.some((item) => item.value === code.value && item.format === code.format);
      if (!seenBefore) {
        events.push({
          id: eventId('code-scanned'),
          type: 'code_scanned',
          label: code.format ? `${code.format} code` : 'Code scanned',
          confidence: code.confidence,
          occurredAt,
          capability: 'code_scanner',
          observationIds: [code.id],
          summary: 'A code was scanned.',
        });
      }
    }

    if (events.length === 0) {
      events.push({
        id: eventId('no-change'),
        type: 'nothing_important_changed',
        label: 'Nothing important changed',
        confidence: 1,
        occurredAt,
        summary: 'Nothing important changed in the current scene.',
      });
    }

    this.previous = scene;
    return events;
  }

  reset(): void {
    this.previous = null;
  }
}

