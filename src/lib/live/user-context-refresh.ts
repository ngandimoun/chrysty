import type { UserContext } from '@/lib/gemini/user-context';

export const USER_CONTEXT_REFRESH_CHECK_MS = 60_000;
export const USER_CONTEXT_STALE_MS = 300_000;

export function buildLiveUserContextRefreshPayload(userContext: UserContext) {
  return {
    type: 'user_context_update' as const,
    user_context: userContext,
  };
}

export function isLiveUserContextStale(
  userContext: UserContext | null,
  now = Date.now(),
): boolean {
  if (!userContext?.coordinates) return true;
  const capturedAt = Date.parse(userContext.geolocationTimestamp ?? userContext.clientTimestamp);
  return !Number.isFinite(capturedAt) || now - capturedAt >= USER_CONTEXT_STALE_MS;
}
