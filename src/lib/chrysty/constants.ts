import { WORKER_SLUG, WORKER_URL } from '@/lib/astra/constants';

export { WORKER_SLUG, WORKER_URL };

function isLocalDevUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function getAuthReturnUrl(returnUrl = WORKER_URL): string {
  if (!isLocalDevUrl(returnUrl)) {
    return returnUrl;
  }

  const origin = new URL(returnUrl).origin;
  return `${origin}/auth/callback`;
}

export function getLoginRedirectUrl(returnUrl = WORKER_URL): string {
  const target = getAuthReturnUrl(returnUrl);
  return `https://www.chrysty.dev/?login=1&next=${encodeURIComponent(target)}`;
}
