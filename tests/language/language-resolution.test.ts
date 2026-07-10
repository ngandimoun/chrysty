import assert from 'node:assert/strict';

import {
  appendCompanionProfileToFormData,
  normalizeCompanionProfile,
} from '../../src/lib/client/companion-profile';
import { explanationToArtifactRecords } from '../../src/lib/documents/save-explanation-artifacts';
import { compactObjectiveEnvelope } from '../../src/lib/live/objective';
import {
  normalizeBcp47,
  resolveArtifactLanguage,
} from '../../src/lib/language/language-resolution';
import { EMPTY_EXPLANATION } from '../../src/lib/streaming/types';
import { toBackgroundJobClientItem } from '../../src/lib/background-jobs/types';

assert.equal(normalizeBcp47('JA_jp'), 'ja-JP');
assert.equal(normalizeBcp47('French'), 'fr');
assert.equal(normalizeBcp47('ar'), 'ar');
assert.equal(normalizeBcp47('not a language'), null);

assert.deepEqual(
  resolveArtifactLanguage({
    explicitArtifactLanguage: 'ja',
    requestLanguage: 'fr',
    preferredLanguage: { code: 'ar', label: 'Arabic' },
    deviceLocale: 'en-US',
  }),
  { code: 'ja', source: 'explicit' },
);
assert.equal(resolveArtifactLanguage({ requestLanguage: 'fr', deviceLocale: 'en-US' }).code, 'fr');
assert.equal(
  resolveArtifactLanguage({ preferredLanguage: { code: 'ar', label: 'Arabic' }, deviceLocale: 'en-US' }).code,
  'ar',
);
assert.equal(resolveArtifactLanguage({ deviceLocale: 'en-US' }).code, 'en-US');

const profile = normalizeCompanionProfile({
  preferredName: '  Aya ',
  preferredLanguage: { code: 'ja_jp', label: ' Japanese ' },
});
assert.deepEqual(profile.preferredLanguage, { code: 'ja-JP', label: 'Japanese' });
const form = new FormData();
appendCompanionProfileToFormData(form, profile);
assert.deepEqual(JSON.parse(String(form.get('companionProfile'))), profile);

const envelope = compactObjectiveEnvelope({
  finalized_objective: 'Prepare the guide',
  language: { resolved: 'fr_fr', requested: 'French' },
});
assert.equal(envelope?.language.resolved, 'fr-FR');

const records = explanationToArtifactRecords({
  ...EMPTY_EXPLANATION,
  fullText: 'شرح محفوظ',
  artifactLanguage: 'ar',
});
assert.equal(records[0]?.artifactLanguage, 'ar');

const job = toBackgroundJobClientItem({
  id: 'job-1',
  workspace_id: 'workspace-1',
  astra_key: 'astra-1',
  user_id: null,
  title: 'Guide',
  objective: 'Create a guide',
  artifact_language: 'ja',
  status: 'queued',
  plan: null,
  working_state: {},
  progress: {},
  error: null,
  result_summary: null,
  document_ids: [],
  origin: null,
  leg_count: 0,
  heartbeat_at: null,
  seen_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  completed_at: null,
});
assert.equal(job.artifactLanguage, 'ja');

console.log('language resolution tests passed');
