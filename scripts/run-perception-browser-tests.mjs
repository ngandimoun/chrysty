import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const pnpm = 'pnpm';
const node = process.execPath;
const localPort = process.env.PORT ?? '3000';
const localBaseUrl = `http://localhost:${localPort}`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: options.shell ?? false,
      env: {
        ...process.env,
        ENABLE_PERCEPTION_TEST_ROUTE: 'true',
        NEXT_PUBLIC_ENABLE_PERCEPTION_TEST_ROUTE: 'true',
        NEXT_PUBLIC_PERCEPTION_ENABLED: 'true',
        ...options.env,
      },
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
      }
    });
  });
}

function start(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: options.shell ?? false,
    env: {
      ...process.env,
      ENABLE_PERCEPTION_TEST_ROUTE: 'true',
      NEXT_PUBLIC_ENABLE_PERCEPTION_TEST_ROUTE: 'true',
      NEXT_PUBLIC_PERCEPTION_ENABLED: 'true',
      ...options.env,
    },
  });
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function stopServer(child) {
  if (!child || child.killed) return;
  if (isWindows && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
      });
      killer.on('exit', resolve);
      killer.on('error', resolve);
    });
    return;
  }
  child.kill('SIGTERM');
}

async function main() {
  await run(node, ['scripts/fetch-perception-test-assets.mjs']);

  const shell = isWindows;
  let server;
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    await run(pnpm, ['build'], { shell });
    server = start(pnpm, ['start'], { shell });
  }

  try {
    if (server) {
      await waitForUrl(localBaseUrl);
    }
    await run(
      pnpm,
      ['exec', 'playwright', 'test', 'tests/perception/perception.browser.spec.ts', ...process.argv.slice(2)],
      {
        shell,
        env: {
          PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? localBaseUrl,
        },
      },
    );
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

