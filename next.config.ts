import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

import { buildEmbedFrameAncestorsCsp } from './src/lib/embed/frame-headers';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

function loadConfiguredDevHost(): string | null {
  if (process.env.DEV_HOST?.trim()) return process.env.DEV_HOST.trim();

  const envPath = join(process.cwd(), '.env.local');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;
      if (trimmed.slice(0, separator).trim() === 'DEV_HOST') {
        const value = trimmed.slice(separator + 1).trim();
        if (value) return value;
      }
    }
  }

  return null;
}

function detectLanIp(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

const configuredDevHost = loadConfiguredDevHost();
const detectedLanIp = detectLanIp();
const allowedDevOrigins = Array.from(
  new Set(['localhost', configuredDevHost, detectedLanIp].filter((value): value is string => Boolean(value))),
);

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ['@mastra/core'],
  allowedDevOrigins,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/embed/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: buildEmbedFrameAncestorsCsp(),
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
