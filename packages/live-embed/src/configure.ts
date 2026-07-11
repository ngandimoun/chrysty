import type { LiveEmbedConfig } from './types.js';

let config: LiveEmbedConfig | null = null;

export function configureLiveEmbed(next: LiveEmbedConfig): void {
  config = {
    ...next,
    mode: next.mode ?? 'iframe',
    astraEmbedUrl: next.astraEmbedUrl.replace(/\/$/, ''),
  };
}

export function getLiveEmbedConfig(): LiveEmbedConfig {
  if (!config) {
    throw new Error(
      'Call configureLiveEmbed({ astraEmbedUrl, worker }) before using @chrysty/live-embed',
    );
  }
  return config;
}

export function buildEmbedLiveUrl(params: {
  worker: string;
  entityId?: string;
  title?: string;
}): string {
  const { astraEmbedUrl } = getLiveEmbedConfig();
  const url = new URL('/embed/live', astraEmbedUrl);
  url.searchParams.set('worker', params.worker);
  if (params.entityId) url.searchParams.set('entity_id', params.entityId);
  if (params.title) url.searchParams.set('title', params.title.slice(0, 120));
  return url.toString();
}

export function isAllowedChrystyOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
    if (/^127\.\d+\.\d+\.\d+$/.test(hostname)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
    return hostname === 'chrysty.dev' || hostname.endsWith('.chrysty.dev');
  } catch {
    return false;
  }
}
