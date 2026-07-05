import type { PerceptionEvent, PerceptionObservation } from './types';

type ObservationListener = (observations: PerceptionObservation[]) => void;
type EventListener = (events: PerceptionEvent[]) => void;

export class PerceptionBus {
  private readonly observations: PerceptionObservation[] = [];
  private readonly events: PerceptionEvent[] = [];
  private readonly observationListeners = new Set<ObservationListener>();
  private readonly eventListeners = new Set<EventListener>();

  publishObservations(observations: PerceptionObservation[]): void {
    if (observations.length === 0) return;
    this.observations.push(...observations);
    this.trim();
    for (const listener of this.observationListeners) {
      listener(observations);
    }
  }

  publishEvents(events: PerceptionEvent[]): void {
    if (events.length === 0) return;
    this.events.push(...events);
    this.trim();
    for (const listener of this.eventListeners) {
      listener(events);
    }
  }

  subscribeObservations(listener: ObservationListener): () => void {
    this.observationListeners.add(listener);
    return () => this.observationListeners.delete(listener);
  }

  subscribeEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  getRecentObservations(limit = 60): PerceptionObservation[] {
    return this.observations.slice(-limit);
  }

  getRecentEvents(limit = 20): PerceptionEvent[] {
    return this.events.slice(-limit);
  }

  clear(): void {
    this.observations.length = 0;
    this.events.length = 0;
  }

  private trim(): void {
    if (this.observations.length > 200) {
      this.observations.splice(0, this.observations.length - 200);
    }
    if (this.events.length > 100) {
      this.events.splice(0, this.events.length - 100);
    }
  }
}

