import assert from 'node:assert/strict';

import { consumeResponseStream } from '../../src/lib/streaming/consume-response-stream';

const body = [
  'event: delegation_progress',
  'data: {"stage":"analyzing"}',
  '',
  'event: code_start',
  'data: {}',
  '',
  'event: explanation_start',
  'data: {"places":[],"charts":[],"codeImages":[],"stockImages":[],"webCitations":[],"customToolCalls":[]}',
  '',
  'event: explanation_done',
  'data: {"text":"A useful result.","places":[],"charts":[],"codeImages":[],"stockImages":[],"webCitations":[],"customToolCalls":[]}',
  '',
  'event: done',
  'data: {"cached":true,"spoken_transcript":"Done."}',
  '',
  '',
].join('\n');

async function main() {
  const stages: string[] = [];
  let explanation = '';
  const result = await consumeResponseStream(
    new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    {
      onAudio: () => {},
      onProgress: (stage) => stages.push(stage),
      onExplanationDone: (text) => {
        explanation = text;
      },
    },
  );

  assert.deepEqual(stages, ['analyzing', 'running_code']);
  assert.equal(explanation, 'A useful result.');
  assert.equal(result.error, null);
  assert.equal(result.done?.spokenTranscript, 'Done.');
  assert.equal(result.done?.timings.totalMs, 0);

  console.log('consume-response-stream tests passed');
}

void main();
