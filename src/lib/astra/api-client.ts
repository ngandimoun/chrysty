import { uploadAstraKeyHeaders } from '@/lib/astra/identity';

export function isRemotePersistenceEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export async function astraFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const keyHeaders = uploadAstraKeyHeaders();
  for (const [key, value] of Object.entries(keyHeaders)) {
    if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  return fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });
}
