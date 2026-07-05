type MetricValue = string | number | boolean | null;

interface MetricEvent {
  name: string;
  fields: Record<string, MetricValue>;
  at: string;
}

const BUFFER_LIMIT = 200;

export class PerceptionMetrics {
  private readonly events: MetricEvent[] = [];

  record(name: string, fields: Record<string, MetricValue> = {}): void {
    this.events.push({
      name,
      fields,
      at: new Date().toISOString(),
    });

    if (this.events.length > BUFFER_LIMIT) {
      this.events.splice(0, this.events.length - BUFFER_LIMIT);
    }

    if (
      typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_DEBUG_PERCEPTION === 'true' &&
      typeof console !== 'undefined'
    ) {
      console.debug('[perception]', name, fields);
    }
  }

  snapshot(): MetricEvent[] {
    return [...this.events];
  }
}

export const perceptionMetrics = new PerceptionMetrics();

