'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

function readAuthTokens() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(window.location.search);

  return {
    accessToken: hashParams.get('access_token') ?? searchParams.get('access_token'),
    refreshToken: hashParams.get('refresh_token') ?? searchParams.get('refresh_token'),
  };
}

export function useSessionBootstrap() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const { accessToken, refreshToken } = readAuthTokens();

      if (accessToken && refreshToken) {
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (!error) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }

      if (!cancelled) {
        setReady(true);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}

/** Applies hub SSO tokens from URL without blocking the app shell. */
export function SessionBootstrap() {
  useSessionBootstrap();
  return null;
}
