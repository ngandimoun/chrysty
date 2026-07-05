'use client';

import { buildPerceptionPromptBlock } from './prompt-builder';
import { sanitizePerceptionSnapshot } from './validate';
import { ContextEngine } from './context-engine';
import { PerceptionManager } from './manager';
import type { PerceptionObservation } from './types';

export interface PerceptionRealTestResult {
  name: string;
  ok: boolean;
  outcome?: unknown;
  error?: string;
}

interface ExpectedFixtureValues {
  qrValue: string;
  ocrText: string;
}

const EXPECTED_URL = '/test-fixtures/perception/expected.json';

async function timed<T>(name: string, fn: () => Promise<T>): Promise<PerceptionRealTestResult> {
  const startedAt = performance.now();
  try {
    const outcome = await fn();
    return {
      name,
      ok: true,
      outcome: {
        ...(typeof outcome === 'object' && outcome !== null ? outcome : { value: outcome }),
        latencyMs: Math.round(performance.now() - startedAt),
      },
    };
  } catch (error) {
    return {
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      outcome: { latencyMs: Math.round(performance.now() - startedAt) },
    };
  }
}

async function loadExpectedValues(): Promise<ExpectedFixtureValues> {
  const response = await fetch(EXPECTED_URL);
  if (!response.ok) throw new Error(`Missing expected fixture values: ${response.status}`);
  return response.json() as Promise<ExpectedFixtureValues>;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.src = src;
  await image.decode();
  return image;
}

function imageToCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable.');
  ctx.drawImage(image, 0, 0);
  return canvas;
}

async function runCodeScanner(expected: ExpectedFixtureValues) {
  const { BrowserQRCodeReader } = await import('@zxing/browser');
  const image = await loadImage('/test-fixtures/perception/qr.png');
  const canvas = imageToCanvas(image);
  const reader = new BrowserQRCodeReader();
  const result = reader.decodeFromCanvas(canvas);
  const text = result.getText();
  if (text !== expected.qrValue) {
    throw new Error(`Expected QR "${expected.qrValue}", got "${text}".`);
  }
  return { decodedValue: text, fixture: 'qr.png' };
}

async function runTextReader(expected: ExpectedFixtureValues) {
  const { createWorker } = await import('tesseract.js');
  const image = await loadImage('/test-fixtures/perception/ocr-text.svg');
  const canvas = imageToCanvas(image);
  const worker = await createWorker('eng', 1, {
    workerPath: '/models/perception/tesseract/worker.min.js',
    corePath: '/models/perception/tesseract-core',
    langPath: '/models/perception/tesseract/',
  });

  try {
    const result = await worker.recognize(canvas);
    const text = result.data.text.replace(/\s+/g, ' ').trim().toUpperCase();
    const expectedText = expected.ocrText.toUpperCase();
    if (!text.includes(expectedText)) {
      throw new Error(`Expected OCR text to contain "${expectedText}", got "${text}".`);
    }
    return {
      recognizedText: text,
      confidence: result.data.confidence,
      fixture: 'ocr-text.svg',
    };
  } finally {
    await worker.terminate();
  }
}

async function runOnnxInference() {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create('/test-fixtures/perception/matmul.onnx', {
    executionProviders: ['wasm'],
  });
  const tensorA = new ort.Tensor('float32', Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), [3, 4]);
  const tensorB = new ort.Tensor('float32', Float32Array.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]), [4, 3]);
  const results = await session.run({ a: tensorA, b: tensorB });
  const data = Array.from(results.c.data as Float32Array);
  const expected = [700, 800, 900, 1580, 1840, 2100, 2460, 2880, 3300];
  if (data.length !== expected.length || data.some((value, index) => Math.abs(value - expected[index]!) > 0.001)) {
    throw new Error(`Unexpected ONNX output: ${data.join(', ')}`);
  }
  return { output: data, model: 'matmul.onnx' };
}

async function runMediaPipeRuntime() {
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks('/models/perception/mediapipe/wasm');
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/models/perception/mediapipe/hand_landmarker.task',
      delegate: 'CPU',
    },
    runningMode: 'IMAGE',
    numHands: 1,
  });

  try {
    const image = await loadImage('/test-fixtures/perception/blank-scene.svg');
    const canvas = imageToCanvas(image);
    const result = landmarker.detect(canvas);
    return {
      handsDetected: result.landmarks.length,
      fixture: 'blank-scene.svg',
      model: 'hand_landmarker.task',
    };
  } finally {
    landmarker.close();
  }
}

async function runPerceptionSnapshotIntegration() {
  const engine = new ContextEngine();
  engine.setProfile('shopping');
  const now = new Date().toISOString();
  const observations: PerceptionObservation[] = [
    {
      id: 'object-1',
      kind: 'object',
      capability: 'object_finder',
      label: 'coffee mug',
      confidence: 0.82,
      source: 'test-fixture',
      observedAt: now,
    },
    {
      id: 'text-1',
      kind: 'text',
      capability: 'text_reader',
      label: 'Visible text',
      text: 'CHRYSTY VISION TEST 123',
      confidence: 0.91,
      source: 'test-fixture',
      observedAt: now,
    },
  ];
  const snapshot = engine.ingest(observations, now);
  const sanitized = sanitizePerceptionSnapshot(JSON.parse(JSON.stringify(snapshot)));
  const promptBlock = buildPerceptionPromptBlock(sanitized);

  if (!sanitized) throw new Error('Sanitized perception snapshot missing.');
  if (!promptBlock.includes('Current scene state')) throw new Error('Prompt block did not include scene state.');
  if (!promptBlock.includes('coffee mug')) throw new Error('Prompt block did not include object observation.');

  return {
    profile: sanitized.profile,
    objectLabels: sanitized.scene.objects.map((item) => item.label),
    textValues: sanitized.scene.text.map((item) => item.text ?? item.label),
    objectCount: sanitized.scene.objects.length,
    textCount: sanitized.scene.text.length,
    promptIncludesScene: promptBlock.includes('Current scene state'),
  };
}

async function runPerceptionManagerIntegration() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable.');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.font = '48px Arial';
  ctx.fillText('CHRYSTY', 120, 220);

  const stream = canvas.captureStream(2);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  document.body.appendChild(video);

  const manager = new PerceptionManager({ profile: 'general' });
  try {
    await video.play();
    manager.start(video);
    await new Promise((resolve) => window.setTimeout(resolve, 2800));
    const snapshot = manager.snapshot();
    if (snapshot.version !== 1) throw new Error('Invalid perception snapshot version.');
    if (!snapshot.scene || !Array.isArray(snapshot.detectorHealth)) {
      throw new Error('Snapshot missing scene or detector health.');
    }
    return {
      profile: snapshot.profile,
      healthCount: snapshot.detectorHealth.length,
      eventCount: snapshot.events.length,
      hasScene: Boolean(snapshot.scene),
    };
  } finally {
    manager.stop();
    stream.getTracks().forEach((track) => track.stop());
    video.remove();
  }
}

export async function runPerceptionRealTests(): Promise<PerceptionRealTestResult[]> {
  const expected = await loadExpectedValues();
  const tests: Array<[string, () => Promise<unknown>]> = [
    ['code-scanner-zxing', () => runCodeScanner(expected)],
    ['text-reader-tesseract', () => runTextReader(expected)],
    ['onnxruntime-web-inference', runOnnxInference],
    ['mediapipe-tasks-vision', runMediaPipeRuntime],
    ['perception-snapshot-contract', runPerceptionSnapshotIntegration],
    ['perception-manager-browser-loop', runPerceptionManagerIntegration],
  ];

  const results: PerceptionRealTestResult[] = [];
  for (const [name, test] of tests) {
    results.push(await timed(name, test));
  }
  return results;
}

