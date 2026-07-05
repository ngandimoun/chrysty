'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useSessionBootstrap } from '@/components/auth/session-bootstrap';
import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import { getLoginRedirectUrl } from '@/lib/chrysty/constants';

const PUBLIC_PATH_PREFIXES = ['/auth/'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const checked = useRef(false);
  const bootstrapped = useSessionBootstrap();

  useEffect(() => {
    if (!isRemotePersistenceEnabled() || isPublicPath(pathname)) {
      setReady(true);
      return;
    }

    if (!bootstrapped || checked.current) {
      return;
    }

    checked.current = true;

    const timeout = window.setTimeout(() => {
      setFailed(true);
    }, 12_000);

    fetch('/api/auth/session', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Session check failed (${response.status})`);
        }
        return response.json() as Promise<{ valid: boolean }>;
      })
      .then(({ valid }) => {
        window.clearTimeout(timeout);
        if (!valid) {
          window.location.replace(getLoginRedirectUrl(window.location.href));
          return;
        }
        setReady(true);
      })
      .catch(() => {
        window.clearTimeout(timeout);
        setFailed(true);
      });

    return () => window.clearTimeout(timeout);
  }, [bootstrapped, pathname]);

  if (!isRemotePersistenceEnabled()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-muted-foreground">
        <p>Supabase is not configured. Add auth keys to `.env.local` to use Chrysty.</p>
      </div>
    );
  }

  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  if (ready) {
    return <>{children}</>;
  }

  if (failed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-muted-foreground">
        <p>We couldn&apos;t verify your Chrysty session.</p>
        <a
          href={getLoginRedirectUrl(typeof window !== 'undefined' ? window.location.href : undefined)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Sign in on chrysty.dev
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Checking your Chrysty session…
    </div>
  );
}
