export interface LanguagePreference {
  code: string;
  label: string;
}

export interface LanguageResolutionInput {
  explicitArtifactLanguage?: string | null;
  requestLanguage?: string | null;
  preferredLanguage?: LanguagePreference | string | null;
  deviceLocale?: string | null;
}

export interface ResolvedLanguage {
  code: string;
  source: 'explicit' | 'request' | 'preferred' | 'device' | 'compatibility';
}

const LIVE_LANGUAGE_CODES = [
  'af', 'am', 'ar', 'az', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en',
  'es', 'et', 'eu', 'fa', 'fi', 'fil', 'fr', 'ga', 'gl', 'gu', 'he', 'hi', 'hr', 'hu',
  'hy', 'id', 'is', 'it', 'ja', 'jv', 'ka', 'kk', 'km', 'kn', 'ko', 'lo', 'lt', 'lv',
  'mk', 'ml', 'mn', 'mr', 'ms', 'my', 'ne', 'nl', 'no', 'pa', 'pl', 'pt', 'ro', 'ru',
  'si', 'sk', 'sl', 'sq', 'sr', 'su', 'sv', 'sw', 'ta', 'te', 'th', 'tr', 'uk', 'ur',
  'uz', 'vi', 'zh-CN', 'zh-TW', 'zu',
] as const;

export const GEMINI_LIVE_LANGUAGES: LanguagePreference[] = LIVE_LANGUAGE_CODES.map((code) => {
  let label: string = code;
  try {
    label = new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    // Keep the stable code when display names are unavailable.
  }
  return { code, label };
}).sort((a, b) => a.label.localeCompare(b.label));

const LEGACY_LANGUAGE_NAMES: Record<string, string> = {
  arabic: 'ar',
  english: 'en',
  french: 'fr',
  japanese: 'ja',
};

export function normalizeBcp47(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/_/g, '-');
  if (!trimmed) return null;
  const mapped = LEGACY_LANGUAGE_NAMES[trimmed.toLowerCase()] ?? trimmed;
  try {
    return Intl.getCanonicalLocales(mapped)[0] ?? null;
  } catch {
    return null;
  }
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference | undefined {
  if (!value) return undefined;
  const record =
    typeof value === 'string'
      ? { code: value, label: value }
      : typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
  const code = normalizeBcp47(record.code);
  if (!code) return undefined;
  const suppliedLabel = typeof record.label === 'string' ? record.label.trim() : '';
  let label = suppliedLabel;
  if (!label) {
    try {
      label = new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
    } catch {
      label = code;
    }
  }
  return { code, label };
}

export function resolveArtifactLanguage(input: LanguageResolutionInput): ResolvedLanguage {
  const explicit = normalizeBcp47(input.explicitArtifactLanguage);
  if (explicit) return { code: explicit, source: 'explicit' };
  const request = normalizeBcp47(input.requestLanguage);
  if (request) return { code: request, source: 'request' };
  const preferred = normalizeLanguagePreference(input.preferredLanguage)?.code;
  if (preferred) return { code: preferred, source: 'preferred' };
  const device = normalizeBcp47(input.deviceLocale);
  if (device) return { code: device, source: 'device' };
  return { code: 'en', source: 'compatibility' };
}

export function buildLanguagePolicyBlock(input: LanguageResolutionInput): string {
  const request = normalizeBcp47(input.requestLanguage);
  const artifact = resolveArtifactLanguage(input);
  return [
    'Language policy:',
    `- Current utterance language: ${request ?? 'detect semantically from the current utterance'}.`,
    '- Speak and write this turn\'s explanation canvas in the current utterance language. Re-detect on every turn so the user can switch languages.',
    `- Artifact language: ${artifact.code} (resolved from ${artifact.source}). Use it for delegated work, saved documents, later edits, and final summaries.`,
    '- An explicit artifact-language request overrides request, profile, and device language. Never infer language from brittle phrase lists.',
  ].join('\n');
}
