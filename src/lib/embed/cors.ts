const LOCALHOST_PATTERN = /^127\.\d+\.\d+\.\d+$/;
const LAN_PATTERN = /^192\.168\.\d+\.\d+$/;

export function isAllowedEmbedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
    if (LOCALHOST_PATTERN.test(hostname) || LAN_PATTERN.test(hostname)) return true;
    return hostname === 'chrysty.dev' || hostname.endsWith('.chrysty.dev');
  } catch {
    return false;
  }
}

export function embedCorsHeaders(origin: string | null): HeadersInit {
  if (!isAllowedEmbedOrigin(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-astra-key',
  };
}

export function withEmbedCors<T extends Response>(response: T, origin: string | null): T {
  const headers = embedCorsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
