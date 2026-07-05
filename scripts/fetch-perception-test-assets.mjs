import { createRequire } from 'node:module';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const root = process.cwd();
const fixturesDir = join(root, 'public', 'test-fixtures', 'perception');
const modelsDir = join(root, 'public', 'models', 'perception');

const QR_VALUE = 'chrysty-perception-real-test';
const OCR_TEXT = 'CHRYSTY VISION TEST 123';

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function download(url, destination) {
  if (existsSync(destination)) return;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  await ensureDir(dirname(destination));
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

function packageRoot(packageName, paths) {
  try {
    return dirname(require.resolve(`${packageName}/package.json`, paths ? { paths } : undefined));
  } catch {
    return dirname(require.resolve(packageName, paths ? { paths } : undefined));
  }
}

async function copyIfExists(source, destination) {
  if (!existsSync(source) || existsSync(destination)) return false;
  await ensureDir(dirname(destination));
  await copyFile(source, destination);
  return true;
}

async function createFixtures() {
  await ensureDir(fixturesDir);
  await QRCode.toFile(join(fixturesDir, 'qr.png'), QR_VALUE, {
    type: 'png',
    margin: 2,
    width: 320,
    errorCorrectionLevel: 'M',
  });

  const ocrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="260" viewBox="0 0 900 260">
  <rect width="900" height="260" fill="white"/>
  <text x="50" y="125" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="black">${OCR_TEXT}</text>
  <text x="50" y="190" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="black">REAL OCR OUTCOME</text>
</svg>`;
  await writeFile(join(fixturesDir, 'ocr-text.svg'), ocrSvg, 'utf8');

  const blankSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="white"/>
  <circle cx="320" cy="240" r="80" fill="#dbeafe"/>
</svg>`;
  await writeFile(join(fixturesDir, 'blank-scene.svg'), blankSvg, 'utf8');
}

async function prepareOnnxAssets() {
  await download(
    'https://raw.githubusercontent.com/microsoft/onnxruntime-inference-examples/main/js/quick-start_onnxruntime-web-script-tag/model.onnx',
    join(fixturesDir, 'matmul.onnx'),
  );
}

async function prepareTesseractAssets() {
  const tesseractRoot = packageRoot('tesseract.js');
  const coreRoot = packageRoot('tesseract.js-core', [tesseractRoot]);
  await copyIfExists(join(tesseractRoot, 'dist', 'worker.min.js'), join(modelsDir, 'tesseract', 'worker.min.js'));

  const coreDest = join(modelsDir, 'tesseract-core');
  await ensureDir(coreDest);
  for (const file of await readdir(coreRoot)) {
    if (file.startsWith('tesseract-core') && (file.endsWith('.js') || file.endsWith('.wasm'))) {
      await copyIfExists(join(coreRoot, file), join(coreDest, file));
    }
  }

  await download(
    'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',
    join(modelsDir, 'tesseract', 'eng.traineddata.gz'),
  );
}

async function prepareMediaPipeAssets() {
  const visionRoot = packageRoot('@mediapipe/tasks-vision');
  const wasmDest = join(modelsDir, 'mediapipe', 'wasm');
  await ensureDir(wasmDest);

  for (const file of ['vision_wasm_internal.js', 'vision_wasm_nosimd_internal.js', 'vision_wasm_module_internal.js']) {
    await copyIfExists(join(visionRoot, 'wasm', file), join(wasmDest, file));
  }

  const version = '0.10.35';
  for (const file of [
    'vision_wasm_internal.wasm',
    'vision_wasm_nosimd_internal.wasm',
    'vision_wasm_module_internal.wasm',
  ]) {
    await download(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm/${file}`,
      join(wasmDest, file),
    );
  }

  await download(
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    join(modelsDir, 'mediapipe', 'hand_landmarker.task'),
  );
}

async function main() {
  await createFixtures();
  await prepareOnnxAssets();
  await prepareTesseractAssets();
  await prepareMediaPipeAssets();
  await writeFile(
    join(fixturesDir, 'expected.json'),
    JSON.stringify({ qrValue: QR_VALUE, ocrText: OCR_TEXT }, null, 2),
    'utf8',
  );
  console.log('[perception-assets] ready');
}

main().catch((error) => {
  console.error('[perception-assets] failed:', error);
  process.exitCode = 1;
});

