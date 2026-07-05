import { createServerClient } from '@supabase/ssr';

export { createAdminClient, getUploadsBucket, isSupabaseConfigured } from '@/lib/supabase/admin';

function getRequestCookies(request: Request): { name: string; value: string }[] {
  const withCookies = request as Request & {
    cookies?: { getAll(): { name: string; value: string }[] };
  };

  if (withCookies.cookies?.getAll) {
    return withCookies.cookies.getAll();
  }

  const header = request.headers.get('cookie');
  if (!header) {
    return [];
  }

  return header.split(';').map((part) => {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      return { name: trimmed, value: '' };
    }
    return {
      name: trimmed.slice(0, separator),
      value: trimmed.slice(separator + 1),
    };
  });
}

export async function getAuthenticatedSupabase(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return getRequestCookies(request);
      },
      setAll() {
        // Route handlers read the shared Chrysty session cookie only.
      },
    },
  });
}

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  try {
    const supabase = await getAuthenticatedSupabase(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id ?? null;
  } catch {
    return null;
  }
}
