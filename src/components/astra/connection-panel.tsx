'use client';

import { useState } from 'react';

import { touchButtonClass } from '@/components/astra/camera-tool-button';
import { UserAvatar } from '@/components/auth/connected-user-badge';
import { Button } from '@/components/ui/button';
import { useAuthUser } from '@/hooks/use-auth-user';
import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import { ensureAstraWorkspaceKeyReady } from '@/lib/astra/workspace-session';
import { getFirstName } from '@/lib/chrysty/display-name';
import { getBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export function ConnectionPanel() {
  const { user, loading, error, setUser } = useAuthUser();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-4 py-3">
        <UserAvatar user={user} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{firstName}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {displayError ? <p className="text-sm text-destructive">{displayError}</p> : null}

      <Button
        type="button"
        variant="outline"
        className={cn('w-full', touchButtonClass)}
        disabled={busy}
        onClick={() => void handleSignOut()}
      >
        Sign out
      </Button>
    </div>
  );
}
