/**
 * Smoke-test POST /api/respond/stream — verifies SSE events including streaming audio chunks.
 * Usage: node scripts/smoke-respond-stream.mjs [baseUrl]
 */
import { Blob, File } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = process.argv[2]?.replace(/\/$/, '') || 'https://localhost:3000';

function makeSilentWav(durationSec = 1.5, sampleRate = 16000) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function parseSseBlocks(text) {
  const events = [];
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    try {
      events.push({ event, data: JSON.parse(dataLines.join('\n')) });
    } catch {
      events.push({ event, data: dataLines.join('\n') });
    }
  }
  return events;
}

async function main() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  console.log(`Smoke test: ${baseUrl}/api/respond/stream`);

  const wav = makeSilentWav();
  const formData = new FormData();
  formData.append('audio', new File([wav], 'smoke.wav', { type: 'audio/wav' }));
  formData.append('mimeType', 'audio/wav');
  formData.append('audioDurationMs', '1500');

  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/respond/stream`, {
    method: 'POST',
    headers: {
      'x-astra-key': 'ak_smoketest000000000000000000000000',
    },
    body: formData,
  });

  const body = await response.text();
  const elapsedMs = Math.round(performance.now() - startedAt);
  const events = parseSseBlocks(body);

  const summary = {
    httpStatus: response.status,
    elapsedMs,
    eventTypes: events.map((e) => e.event),
    audioChunkCount: events.filter((e) => e.event === 'audio').length,
    hasExplanationStart: events.some((e) => e.event === 'explanation_start'),
    hasExplanationDelta: events.some((e) => e.event === 'explanation_delta'),
    hasTtsError: events.some((e) => e.event === 'tts_error'),
    hasError: events.some((e) => e.event === 'error'),
    done: events.find((e) => e.event === 'done')?.data ?? null,
    error: events.find((e) => e.event === 'error')?.data ?? null,
    ttsError: events.find((e) => e.event === 'tts_error')?.data ?? null,
  };

  console.log(JSON.stringify(summary, null, 2));

  const logPath = join(dirname(fileURLToPath(import.meta.url)), 'smoke-respond-stream-last.json');
  writeFileSync(logPath, JSON.stringify({ summary, events: events.map(({ event, data }) => ({ event, data: event === 'audio' ? { sample_rate: data.sample_rate, bytes: data.data?.length ?? 0 } : data })) }, null, 2));

  if (!response.ok || summary.hasError) {
    process.exitCode = 1;
  } else if (summary.audioChunkCount === 0 && !summary.hasTtsError) {
    console.warn('WARN: no audio chunks and no tts_error — unexpected');
    process.exitCode = 1;
  } else if (summary.audioChunkCount === 1) {
    console.log('OK: buffered TTS emitted a single audio event');
  } else if (summary.audioChunkCount > 1) {
    console.warn(`WARN: ${summary.audioChunkCount} audio chunks — expected 1 for buffered TTS`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
