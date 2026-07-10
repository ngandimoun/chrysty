import assert from 'node:assert/strict';

import { explanationToArtifactRecords } from '../../src/lib/documents/save-explanation-artifacts';
import {
  MAX_WORKSPACE_EXCERPT_CHARS,
  MAX_WORKSPACE_SELECTION_CHARS,
  MAX_WORKSPACE_CONTEXT_TITLE_CHARS,
  buildNearbyExcerpt,
  compactWorkspaceUiContext,
} from '../../src/lib/live/workspace-context';
import {
  WorkspaceContextError,
  validateActiveDocumentActionScope,
} from '../../src/lib/live/workspace-context-loader';
import { EMPTY_EXPLANATION } from '../../src/lib/streaming/types';

const compact = compactWorkspaceUiContext({
  source: 'generated_document',
  document_id: 'doc-1',
  title: 't'.repeat(500),
  revision: 3,
  selected_passage: 's'.repeat(2000),
  nearby_excerpt: 'e'.repeat(4000),
  saved: true,
  updated_at: new Date().toISOString(),
});
assert(compact);
assert.equal(compact.title.length, MAX_WORKSPACE_CONTEXT_TITLE_CHARS);
assert.equal(compact.selected_passage.length, MAX_WORKSPACE_SELECTION_CHARS);
assert.equal(compact.nearby_excerpt.length, MAX_WORKSPACE_EXCERPT_CHARS);
assert.equal(compactWorkspaceUiContext({ source: 'generated_document', saved: true }), null);

const excerpt = buildNearbyExcerpt(
  `${'before '.repeat(400)}selected passage${' after'.repeat(400)}`,
  'selected passage',
);
assert(excerpt.includes('selected passage'));
assert(excerpt.length <= MAX_WORKSPACE_EXCERPT_CHARS);

assert.throws(
  () => validateActiveDocumentActionScope({
    context: compact,
    documentId: 'doc-1',
    expectedRevision: 3,
    confirmedUserIntent: false,
  }),
  (error: unknown) =>
    error instanceof WorkspaceContextError && error.code === 'explicit_intent_required',
);
assert.throws(
  () => validateActiveDocumentActionScope({
    context: compact,
    documentId: 'other-user-document',
    expectedRevision: 3,
    confirmedUserIntent: true,
  }),
  (error: unknown) =>
    error instanceof WorkspaceContextError && error.code === 'ambiguous_document',
);
assert.throws(
  () => validateActiveDocumentActionScope({
    context: compact,
    documentId: 'doc-1',
    expectedRevision: 2,
    currentRevision: 3,
    confirmedUserIntent: true,
  }),
  (error: unknown) =>
    error instanceof WorkspaceContextError && error.code === 'revision_conflict',
);

const saved = explanationToArtifactRecords({
  ...EMPTY_EXPLANATION,
  active: true,
  fullText: 'A rich explanation',
  charts: [{ id: 'chart-1', kind: 'bar', title: 'Chart', data: [], xKey: 'x', series: [] }],
  places: [{ name: 'Place', url: 'https://example.com/place' }],
  customToolCalls: ['calculator'],
});
assert.equal(saved.length, 1);
assert.equal(saved[0]?.kind, 'text');
const payload = JSON.parse(saved[0]?.jsonPayload ?? '{}') as {
  canvas?: { charts?: unknown[]; places?: unknown[]; customToolCalls?: string[] };
};
assert.equal(payload.canvas?.charts?.length, 1);
assert.equal(payload.canvas?.places?.length, 1);
assert.deepEqual(payload.canvas?.customToolCalls, ['calculator']);

console.log('workspace-context tests passed');
