import { expect, test } from '@playwright/test';

const EXPECTED_TESTS = [
  'code-scanner-zxing',
  'text-reader-tesseract',
  'onnxruntime-web-inference',
  'mediapipe-tasks-vision',
  'perception-snapshot-contract',
  'perception-manager-browser-loop',
];

interface BrowserResult {
  name: string;
  ok: boolean;
  outcome?: unknown;
  error?: string;
}

interface BrowserPayload {
  status: 'running' | 'done' | 'error';
  ok: boolean;
  results: BrowserResult[];
  error?: string;
}

test.describe('perception browser integration', () => {
  test('runs real perception libraries and Chrysty metadata path without Gemini', async ({ page }) => {
    await page.goto('/perception-test');

    await expect(page.getByTestId('perception-status')).toHaveText(/done|error/, {
      timeout: 120_000,
    });

    const payload = JSON.parse(await page.getByTestId('perception-results').innerText()) as BrowserPayload;
    expect(payload.status, payload.error).toBe('done');
    expect(payload.ok, JSON.stringify(payload.results, null, 2)).toBe(true);

    const names = payload.results.map((result) => result.name).sort();
    expect(names).toEqual([...EXPECTED_TESTS].sort());

    for (const result of payload.results) {
      expect(result.ok, `${result.name}: ${result.error ?? 'failed without error'}`).toBe(true);
      expect(result.outcome, `${result.name} should include a real outcome`).toBeTruthy();
    }

    const qr = payload.results.find((result) => result.name === 'code-scanner-zxing')!;
    expect(JSON.stringify(qr.outcome)).toContain('chrysty-perception-real-test');

    const ocr = payload.results.find((result) => result.name === 'text-reader-tesseract')!;
    expect(JSON.stringify(ocr.outcome)).toContain('CHRYSTY VISION TEST 123');

    const onnx = payload.results.find((result) => result.name === 'onnxruntime-web-inference')!;
    expect(JSON.stringify(onnx.outcome)).toContain('3300');

    const mediapipe = payload.results.find((result) => result.name === 'mediapipe-tasks-vision')!;
    expect(JSON.stringify(mediapipe.outcome)).toContain('hand_landmarker.task');

    const snapshot = payload.results.find((result) => result.name === 'perception-snapshot-contract')!;
    expect(JSON.stringify(snapshot.outcome)).toContain('coffee mug');

    const manager = payload.results.find((result) => result.name === 'perception-manager-browser-loop')!;
    expect(JSON.stringify(manager.outcome)).toContain('healthCount');
  });
});

