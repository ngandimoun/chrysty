import { ASTRA_KEY_HEADER } from '@/lib/astra/constants';

export function getAstraKeyFromRequest(request: Request): string | null {
  const key = request.headers.get(ASTRA_KEY_HEADER)?.trim();
  if (!key || key.length < 8) {
    return null;
  }
  return key;
}
