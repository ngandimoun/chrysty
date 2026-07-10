import assert from 'node:assert/strict';

import {
  compactDraftObjective,
  compactObjectiveEnvelope,
  formatObjectiveEnvelope,
} from '../../src/lib/live/objective';

const draft = compactDraftObjective({
  objective: 'Compare the annotated valves.',
  constraints: ['one page'],
  evidence: [
    {
      id: 'capture-7:focus-2',
      kind: 'camera',
      excerpt: 'Corrosion is visible on the right valve.',
    },
  ],
  artifact_language: 'Spanish',
  deliverable: 'maintenance brief',
  open_question: null,
  success_criteria: ['Compare both valves'],
  requested_intents: ['modify_open_document'],
  readiness: 'ready',
});

assert.ok(draft);
assert.equal(draft.readiness, 'ready');

const envelope = compactObjectiveEnvelope({
  version: 1,
  finalized_objective: draft.objective,
  evidence: draft.evidence,
  constraints: draft.constraints,
  language: { resolved: 'Spanish', requested: 'Spanish' },
  deliverable: draft.deliverable,
  success_criteria: draft.success_criteria,
  requested_intents: draft.requested_intents,
});

assert.ok(envelope);
assert.equal(envelope.finalized_objective, 'Compare the annotated valves.');
assert.deepEqual(envelope.requested_intents, ['modify_open_document']);
assert.match(formatObjectiveEnvelope(envelope), /Authoritative objective envelope/);
assert.equal(compactObjectiveEnvelope(undefined), undefined);

console.log('objective envelope tests passed');
