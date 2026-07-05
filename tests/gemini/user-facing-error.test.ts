import assert from 'node:assert/strict';

import { formatUserFacingGeminiError } from '@/lib/gemini/user-facing-error';

assert.equal(
  formatUserFacingGeminiError(
    'Gemini model gemini-3.1-flash-lite deadline exceeded after 25000ms.',
  ),
  'Chrysty took too long to respond (25000 ms). Try again.',
);

assert.equal(
  formatUserFacingGeminiError('Model gemini-3.5-flash is not found for api version'),
  'Model is not found for api version',
);

assert.equal(
  formatUserFacingGeminiError('Connect before recording.'),
  'Connect before recording.',
);

assert.equal(formatUserFacingGeminiError(''), 'Something went wrong. Try again.');

console.log('user-facing-error tests passed');
