import assert from 'node:assert/strict';

import { hydrateChartsFromCodeExecution } from '../../src/lib/gemini/chart-hydration';
import type { VoiceResponsePayload } from '../../src/lib/gemini/voice-response-schema';

const basePayload: VoiceResponsePayload = {
  needs_visual_explanation: false,
  explanation_text: 'Quarterly results',
  spoken_transcript: 'I prepared the quarterly chart.',
  delivery_tag: 'neutral',
  charts: [],
  visual_image_groups: [],
  guidance_mode: 'static',
  live_guide: null,
};

const hydrated = hydrateChartsFromCodeExecution(basePayload, {
  usedCodeExecution: true,
  interactions: [
    {
      steps: [
        {
          type: 'code_execution_result',
          result:
            '[{"quarter":"Q1","revenue":12},{"quarter":"Q2","revenue":18},{"quarter":"Q3","revenue":24}]',
        },
      ],
    },
  ],
});

assert.equal(hydrated.needs_visual_explanation, true);
assert.equal(hydrated.charts.length, 1);
assert.equal(hydrated.charts[0]?.xKey, 'quarter');
assert.equal(hydrated.charts[0]?.data.length, 3);
assert.equal(hydrated.charts[0]?.series[0]?.key, 'revenue');

const unchanged = hydrateChartsFromCodeExecution(basePayload, {
  usedCodeExecution: true,
  interactions: [{ steps: [{ type: 'code_execution_result', result: 'No tabular output' }] }],
});

assert.equal(unchanged.charts.length, 0);
assert.equal(unchanged.needs_visual_explanation, false);

console.log('chart-hydration tests passed');
