import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const certDir = join(projectRoot, 'certificates');
const keyPath = join(certDir, 'dev-key.pem');
const certPath = join(certDir, 'dev-cert.pem');

function loadEnvLocal() {
  const envPath = join(projectRoot, '.env.local');
  if (!existsSync(envPath)) return {};

  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    values[key] = value;
  }
  return values;
}

function detectLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '192.168.1.69';
}

function run(command) {
  execSync(command, { cwd: projectRoot, stdio: 'inherit', shell: true });
}

function assertMkcertInstalled() {
  try {
    execSync('mkcert -version', { stdio: 'ignore', shell: true });
  } catch {
    console.error(
      [
        'mkcert is not installed or not on PATH.',
        'Install it first: https://github.com/FiloSottile/mkcert#installation',
        'Windows (Chocolatey): choco install mkcert',
        'Windows (Scoop): scoop install mkcert',
      ].join('\n'),
    );
    process.exit(1);
  }
}

const env = { ...process.env, ...loadEnvLocal() };
const devHost = env.DEV_HOST?.trim() || detectLanIp();
const hosts = ['localhost', '127.0.0.1', devHost];

assertMkcertInstalled();
mkdirSync(certDir, { recursive: true });

console.log(`Installing local CA (if needed) and generating certs for: ${hosts.join(', ')}`);
run('mkcert -install');
run(`mkcert -key-file "${keyPath}" -cert-file "${certPath}" ${hosts.join(' ')}`);

console.log('\nDev certificates ready.');
console.log(`  Key:  ${keyPath}`);
console.log(`  Cert: ${certPath}`);
console.log('\nStart HTTPS dev server:');
console.log('  pnpm dev:https');
console.log('\nOn iPad Safari (same Wi-Fi), open:');
console.log(`  https://${devHost}:3000`);
console.log('\nIf Safari warns about the certificate, install the mkcert root CA on iPad:');
console.log('  https://github.com/FiloSottile/mkcert#mobile-devices');
