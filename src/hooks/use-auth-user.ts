'use client';

import { useCallback, useEffect, useState } from 'react';

import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';

export type AuthUser = {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
};

export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    if (!isRemotePersistenceEnabled()) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (response.status === 401) {
        setUser(null);
        return;
      }
      if (!response.ok) {
        throw new Error('Could not load account');
      }
      setUser((await response.json()) as AuthUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load account');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  return { user, loading, error, refreshUser, setUser };
}
