import assert from 'node:assert/strict';

import type { GeneratedDocumentItem } from '../../src/hooks/use-generated-documents';
import { validateMathPhysicsProjectile } from '../../src/lib/background-jobs/benchmark-validate';
import { groupDocumentsIntoCollections } from '../../src/lib/documents/document-collections';
import {
  buildDocumentMergePreview,
  livingDocumentSourceKey,
  objectiveRequestsMultipleDeliverables,
  requireConfirmedMerge,
  resolveLivingDeliverableKey,
  upsertLivingDocumentSection,
} from '../../src/lib/documents/living-document';

function item(input: {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  readAt?: number | null;
}): GeneratedDocumentItem {
  return {
    ...input,
    kind: 'text',
    kindLabel: 'Text',
    readAt: input.readAt ?? null,
    previewUrl: null,
    record: {
      id: input.id,
      kind: 'text',
      title: input.title,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      readAt: input.readAt ?? null,
      revision: 1,
      jsonPayload: JSON.stringify({ fullText: input.title }),
    },
  };
}

const collections = groupDocumentsIntoCollections([
  item({ id: 'unread-old', title: 'Alpha note', createdAt: 100, updatedAt: 100 }),
  item({ id: 'read-new', title: 'Beta note', createdAt: 50, updatedAt: 500, readAt: 450 }),
]);
assert.equal(collections[0]?.documents[0]?.id, 'read-new', 'activity must outrank unread status');

const objective = 'Research the topic and prepare a useful report.';
const firstKey = resolveLivingDeliverableKey({ objective, title: 'Research', kind: 'text' });
const secondKey = resolveLivingDeliverableKey({ objective, title: 'Final report', kind: 'text' });
assert.equal(firstKey, 'primary');
assert.equal(secondKey, 'primary');
assert.equal(livingDocumentSourceKey('job-1', firstKey), livingDocumentSourceKey('job-1', secondKey));

const benchmarkDocument = {
  id: 'primary',
  kind: 'text',
  title: 'Projectile guide',
  json_payload: JSON.stringify({ fullText: '$x^2$\n\n1. Worked example' }),
};
assert.equal(validateMathPhysicsProjectile([benchmarkDocument]).passed, true);
assert.equal(
  validateMathPhysicsProjectile([benchmarkDocument, { ...benchmarkDocument, id: 'duplicate' }]).passed,
  false,
);

const firstWrite = upsertLivingDocumentSection({
  currentMarkdown: '',
  sectionKey: 'findings',
  sectionTitle: 'Findings',
  markdown: 'Version one',
});
const retryWrite = upsertLivingDocumentSection({
  currentMarkdown: firstWrite,
  sectionKey: 'findings',
  sectionTitle: 'Findings',
  markdown: 'Version two',
});
assert.equal((retryWrite.match(/astra-section:findings:start/g) ?? []).length, 1);
assert.doesNotMatch(retryWrite, /Version one/);
assert.match(retryWrite, /Version two/);

const explicitMultiple =
  'Create three separate markdown documents: (1) guide, (2) flashcards, and (3) quiz.';
assert.equal(objectiveRequestsMultipleDeliverables(explicitMultiple), true);
assert.notEqual(
  resolveLivingDeliverableKey({ objective: explicitMultiple, title: 'Guide', kind: 'text' }),
  resolveLivingDeliverableKey({ objective: explicitMultiple, title: 'Quiz', kind: 'text' }),
);

const preview = buildDocumentMergePreview([
  {
    id: 'old',
    title: 'Old notes',
    kind: 'text',
    createdAt: 100,
    updatedAt: 200,
    revision: 2,
    fullText: 'Old content',
  },
  {
    id: 'new',
    title: 'Current report',
    kind: 'text',
    createdAt: 300,
    updatedAt: 400,
    revision: 4,
    fullText: 'Current content',
  },
]);
assert.equal(preview.targetId, 'new');
assert.deepEqual(preview.sourceIds, ['old']);
assert.deepEqual(preview.expectedRevisions, { new: 4, old: 2 });
assert.match(preview.markdown, /## Current report/);
assert.match(preview.markdown, /## Old notes/);
assert.throws(() => requireConfirmedMerge(false), /confirmation/i);
assert.doesNotThrow(() => requireConfirmedMerge(true));

console.log('living-document tests passed');
