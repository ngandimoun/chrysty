import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const keyPath = join(projectRoot, 'certificates', 'dev-key.pem');
const certPath = join(projectRoot, 'certificates', 'dev-cert.pem');

function loadEnvLocal() {
  const envPath = join(projectRoot, '.env.local');
  if (!existsSync(envPath)) return {};
  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

function detectLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '192.168.1.69';
}

const env = { ...process.env, ...loadEnvLocal() };
const configuredDevHost = env.DEV_HOST?.trim() || '';
const detectedLanIp = detectLanIp();
const devHost = detectedLanIp || configuredDevHost || '192.168.1.69';
const ipadUrl = `https://${devHost}:3000`;

if (!existsSync(keyPath) || !existsSync(certPath)) {
  console.error('\nMissing dev certificates. Run first:\n  pnpm certs:install\n');
  process.exit(1);
}

let caRoot = '';
try {
  caRoot = execSync('mkcert -CAROOT', { encoding: 'utf8', shell: true }).trim();
} catch {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const defaultCa = join(localAppData, 'mkcert');
    caRoot = existsSync(join(defaultCa, 'rootCA.pem')) ? defaultCa : '(mkcert root CA not found)';
  } else {
    caRoot = '(run mkcert -CAROOT to find the root CA folder)';
  }
}

console.log('\n=== iPad / Safari dev URLs ===');
console.log(`PC:    https://localhost:3000`);
console.log(`iPad:  ${ipadUrl}`);
if (configuredDevHost && detectedLanIp && configuredDevHost !== detectedLanIp) {
  console.log(`NOTE:  DEV_HOST is set to ${configuredDevHost}, but current LAN IP appears to be ${detectedLanIp}.`);
  console.log(`       Using detected IP for the iPad URL above.`);
}
console.log('\n!!! HTTP WILL NOT WORK ON IPAD !!!');
console.log(`  OLD (broken): http://${devHost}:3000`);
console.log(`  USE THIS:     ${ipadUrl}`);
console.log('\nIMPORTANT:');
console.log('- This server is HTTPS-only. http:// gives "network connection was lost" on iPad.');
console.log('- iPad and PC must be on the same Wi-Fi.');
console.log('- If Safari shows a certificate warning, install mkcert root on iPad:');
console.log(`  1. Copy ${caRoot}\\rootCA.pem to iPad (AirDrop/email)`);
console.log('  2. Install profile, then Settings → General → About → Certificate Trust Settings → enable');
console.log('  https://github.com/FiloSottile/mkcert#mobile-devices');
console.log('- If the page never loads, allow port 3000 in Windows Firewall (run Terminal as Admin).');
console.log('============================\n');
