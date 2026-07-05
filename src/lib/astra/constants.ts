export const WORKER_SLUG = 'chrysty';
export const WORKER_URL = 'https://chrysty.chrysty.dev';

export const ASTRA_KEY_HEADER = 'x-astra-key';
export const ASTRA_KEY_STORAGE = 'chrysty_astra_key';
export const ASTRA_PERSONAL_KEY_STORAGE = 'chrysty_astra_personal_key';
export const ASTRA_KEY_CHANGED_EVENT = 'chrysty-astra-key-changed';
export const BENCHMARK_ASTRA_KEY = 'ak_chrysty_benchmark_suite';

/** Shared dev/test keys — not valid for anonymous browser sessions or logged-in users. */
export const SYSTEM_ASTRA_KEYS = new Set<string>([
  BENCHMARK_ASTRA_KEY,
  'ak_backgroundjob_smoke_test',
  'ak_smoketest000000000000000000000000',
]);

export function isSystemAstraKey(astraKey: string): boolean {
  return SYSTEM_ASTRA_KEYS.has(astraKey);
}

export function getUploadsBucketFromEnv(): string {
  return process.env.SUPABASE_UPLOADS_BUCKET?.trim() || 'astra-uploads';
}
