import { fuseObservations } from './confidence-fusion';
import type { PerceptionObservation, SceneState } from './types';

const EMPTY_SCENE: SceneState = {
  objects: [],
  text: [],
  codes: [],
  people: [],
  hands: [],
  gestures: [],
  lastUpdated: new Date(0).toISOString(),
};

export class SceneManager {
  private scene: SceneState = EMPTY_SCENE;

  update(observations: PerceptionObservation[], now = new Date().toISOString()): SceneState {
    const fused = fuseObservations(observations);
    const objects = fused.filter((item) => item.kind === 'object').slice(0, 12);
    const text = fused.filter((item) => item.kind === 'text').slice(0, 8);
    const codes = fused.filter((item) => item.kind === 'code').slice(0, 5);
    const people = fused.filter((item) => item.kind === 'person' || item.kind === 'face').slice(0, 6);
    const hands = fused.filter((item) => item.kind === 'hand').slice(0, 6);
    const gestures = fused.filter((item) => item.kind === 'gesture').slice(0, 6);

    this.scene = {
      objects,
      text,
      codes,
      people,
      hands,
      gestures,
      summary: buildSceneSummary({ objects, text, codes, people, hands, gestures, lastUpdated: now }),
      lastUpdated: now,
    };

    return this.scene;
  }

  getScene(): SceneState {
    return this.scene;
  }

  reset(): void {
    this.scene = EMPTY_SCENE;
  }
}

function buildSceneSummary(scene: SceneState): string | undefined {
  const parts: string[] = [];
  if (scene.people.length > 0) parts.push(`${scene.people.length} person signal${scene.people.length === 1 ? '' : 's'}`);
  if (scene.objects.length > 0) parts.push(scene.objects.slice(0, 4).map((item) => item.label).join(', '));
  if (scene.text.length > 0) parts.push('visible text');
  if (scene.codes.length > 0) parts.push('code scanned');
  if (scene.hands.length > 0) parts.push('hands visible');
  if (scene.gestures.length > 0) parts.push('gesture visible');
  return parts.length > 0 ? parts.join('; ') : undefined;
}

