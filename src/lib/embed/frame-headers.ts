/**
 * Allow sibling Chrysty apps (*.chrysty.dev) to iframe /embed/live.
 * When both this CSP and vercel.json X-Frame-Options: DENY are present, frame-ancestors wins.
 * Main Astra routes keep DENY unchanged.
 */

const PRODUCTION_ANCESTORS = [
  "'self'",
  'https://chrysty.dev',
  'https://*.chrysty.dev',
] as const;

const DEV_ANCESTORS = [
  ...PRODUCTION_ANCESTORS,
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
] as const;

export function buildEmbedFrameAncestorsCsp(): string {
  const ancestors =
    process.env.NODE_ENV === 'development' ? DEV_ANCESTORS : PRODUCTION_ANCESTORS;
  return `frame-ancestors ${ancestors.join(' ')}`;
}
