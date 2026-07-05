import type { CookieOptions } from '@supabase/ssr';

export function withSharedCookieDomain(options?: CookieOptions) {
  if (process.env.NODE_ENV !== 'production') return options;

  return {
    ...options,
    domain: '.chrysty.dev',
  };
}
