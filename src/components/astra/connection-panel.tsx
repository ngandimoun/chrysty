'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plug, Search } from 'lucide-react';

import { touchButtonClass } from '@/components/astra/camera-tool-button';
import { UserAvatar } from '@/components/auth/connected-user-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthUser } from '@/hooks/use-auth-user';
import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import { ensureAstraWorkspaceKeyReady } from '@/lib/astra/workspace-session';
import { getFirstName } from '@/lib/chrysty/display-name';
import { getBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface ToolkitItem {
  slug: string;
  name: string;
  logo: string | null;
  isNoAuth: boolean;
  connected: boolean;
  connectedAccountId: string | null;
}

interface ConnectionPanelProps {
  returnStatus?: 'connected' | 'error' | null;
  returnToolkit?: string | null;
}

export function ConnectionPanel({
  returnStatus = null,
  returnToolkit = null,
}: ConnectionPanelProps) {
  const { user, loading, error, setUser } = useAuthUser();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [toolkits, setToolkits] = useState<ToolkitItem[]>([]);
  const [toolkitsLoading, setToolkitsLoading] = useState(false);
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (returnStatus === 'connected') {
      const label = returnToolkit ? returnToolkit.replace(/_/g, ' ') : 'Toolkit';
      setBanner(`${label} connected.`);
    } else if (returnStatus === 'error') {
      setBanner('Connection failed or was cancelled. Try again.');
    }
  }, [returnStatus, returnToolkit]);

  const loadToolkits = useCallback(async (search: string) => {
    setToolkitsLoading(true);
    setActionError(null);
    try {
      const trimmed = search.trim();
      // Composio search needs ≥3 chars; shorter queries load the popular list instead.
      const params = new URLSearchParams();
      if (trimmed.length >= 3) params.set('q', trimmed);
      const qs = params.toString();
      const response = await fetch(`/api/composio/toolkits${qs ? `?${qs}` : ''}`, {
        method: 'GET',
        credentials: 'include',
      });
      const payload = (await response.json()) as { items?: ToolkitItem[]; error?: string };
      if (!response.ok) {
        throw new Error('Failed to load toolkits');
      }
      setToolkits(payload.items ?? []);
    } catch {
      setActionError("Couldn't load toolkits. Try again.");
      setToolkits([]);
    } finally {
      setToolkitsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !isRemotePersistenceEnabled()) return;
    const trimmed = query.trim();
    // While typing 1–2 chars, keep showing the current popular list (no request).
    if (trimmed.length > 0 && trimmed.length < 3) return;
    const handle = window.setTimeout(() => {
      void loadToolkits(query);
    }, trimmed.length >= 3 ? 280 : 0);
    return () => window.clearTimeout(handle);
  }, [user, query, loadToolkits]);

  async function handleSignOut() {
    if (!isRemotePersistenceEnabled()) return;

    setBusy(true);
    setActionError(null);

    try {
      const supabase = getBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
      setUser(null);
      await ensureAstraWorkspaceKeyReady();
      window.location.replace('/');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Sign-out failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect(toolkit: ToolkitItem) {
    if (toolkit.connected || toolkit.isNoAuth) return;
    setConnectingSlug(toolkit.slug);
    setActionError(null);
    try {
      const response = await fetch('/api/composio/authorize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolkit: toolkit.slug }),
      });
      const payload = (await response.json()) as { redirectUrl?: string; error?: string };
      if (!response.ok || !payload.redirectUrl) {
        throw new Error('Failed to start connection');
      }
      window.location.assign(payload.redirectUrl);
    } catch {
      setActionError("Couldn't start connection. Try again.");
      setConnectingSlug(null);
    }
  }

  async function handleDisconnect(toolkit: ToolkitItem) {
    setConnectingSlug(toolkit.slug);
    setActionError(null);
    try {
      const response = await fetch(`/api/composio/connections/${encodeURIComponent(toolkit.slug)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }
      await loadToolkits(query);
      setBanner(`${toolkit.name} disconnected.`);
    } catch {
      setActionError("Couldn't disconnect. Try again.");
    } finally {
      setConnectingSlug(null);
    }
  }

  const displayError = actionError ?? error;

  if (!isRemotePersistenceEnabled()) {
    return (
      <p className="text-sm text-muted-foreground">
        Remote persistence is off. Add Supabase keys to `.env.local` to use Chrysty.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading account…</p>;
  }

  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in is required to use Chrysty.
      </p>
    );
  }

  const firstName = getFirstName(user.fullName, user.email);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-4 py-3">
        <UserAvatar user={user} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{firstName}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {banner ? <p className="text-sm text-muted-foreground">{banner}</p> : null}
      {displayError ? <p className="text-sm text-destructive">{displayError}</p> : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Plug className="size-4 text-muted-foreground" aria-hidden />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Toolkits
          </p>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search (3+ characters)…"
            className="pl-9"
            aria-label="Search toolkits"
          />
        </div>

        {toolkitsLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading toolkits…
          </p>
        ) : toolkits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query.trim().length >= 3
              ? 'No toolkits match that search.'
              : 'No popular toolkits available.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 pb-1">
            {toolkits.map((toolkit) => {
              const busyRow = connectingSlug === toolkit.slug;
              return (
                <li
                  key={toolkit.slug}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-2"
                >
                  {toolkit.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={toolkit.logo}
                      alt=""
                      className="size-8 shrink-0 rounded-md object-contain"
                    />
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                      {toolkit.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{toolkit.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{toolkit.slug}</p>
                  </div>
                  {toolkit.connected || toolkit.isNoAuth ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {toolkit.isNoAuth && !toolkit.connectedAccountId ? 'No auth' : 'Connected'}
                      </span>
                      {toolkit.connectedAccountId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn('h-8 px-2', touchButtonClass)}
                          disabled={busyRow}
                          onClick={() => void handleDisconnect(toolkit)}
                        >
                          {busyRow ? '…' : 'Disconnect'}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className={cn('shrink-0', touchButtonClass)}
                      disabled={busyRow}
                      onClick={() => void handleConnect(toolkit)}
                    >
                      {busyRow ? 'Connecting…' : 'Connect'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        className={cn('mt-auto w-full', touchButtonClass)}
        disabled={busy}
        onClick={() => void handleSignOut()}
      >
        Sign out
      </Button>
    </div>
  );
}
