import type { CompanionProfile } from '@/lib/gemini/companion-profile';
import type { UserContext } from '@/lib/gemini/user-context';

export function parseCompanionProfileFromJson(raw: string | null): CompanionProfile | undefined {
  if (!raw?.trim()) return undefined;
  const parsed = JSON.parse(raw) as CompanionProfile;
  return parsed;
}

export function parseUserContextFromJson(raw: string | null): UserContext | undefined {
  if (!raw?.trim()) return undefined;
  return JSON.parse(raw) as UserContext;
}
