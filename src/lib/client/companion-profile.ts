export interface InteractionPreferences {
  responseDepth?: string;
  tones?: string[];
  relationshipMode?: string;
  guidanceStyles?: string[];
  expertiseLenses?: string[];
  outputFormat?: string;
  customTone?: string;
  customExpertise?: string;
  customInstruction?: string;
}

export interface CompanionProfile {
  preferredName?: string;
  occupation?: string;
  foodPreferences?: string;
  healthNotes?: string;
  interests?: string;
  topicsToAvoid?: string;
  interactionPreferences?: InteractionPreferences;
}

export type CompanionProfileField =
  | 'preferredName'
  | 'occupation'
  | 'foodPreferences'
  | 'healthNotes'
  | 'interests'
  | 'topicsToAvoid';
export type InteractionPreferenceTextField =
  | 'responseDepth'
  | 'relationshipMode'
  | 'outputFormat'
  | 'customTone'
  | 'customExpertise'
  | 'customInstruction';
export type InteractionPreferenceArrayField = 'tones' | 'guidanceStyles' | 'expertiseLenses';

const STORAGE_KEY = 'chrysty-companion-profile';

const PROFILE_FIELDS: CompanionProfileField[] = [
  'preferredName',
  'occupation',
  'foodPreferences',
  'healthNotes',
  'interests',
  'topicsToAvoid',
];

const INTERACTION_TEXT_FIELDS: InteractionPreferenceTextField[] = [
  'responseDepth',
  'relationshipMode',
  'outputFormat',
  'customTone',
  'customExpertise',
  'customInstruction',
];

const INTERACTION_ARRAY_FIELDS: InteractionPreferenceArrayField[] = [
  'tones',
  'guidanceStyles',
  'expertiseLenses',
];

function trimField(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const entries: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    entries.push(trimmed);
  }

  return entries.length > 0 ? entries : undefined;
}

export function normalizeInteractionPreferences(
  preferences: InteractionPreferences | null | undefined,
): InteractionPreferences | undefined {
  const record = asRecord(preferences);
  const normalized: InteractionPreferences = {};

  for (const field of INTERACTION_TEXT_FIELDS) {
    const value = typeof record[field] === 'string' ? trimField(record[field]) : undefined;
    if (value) {
      normalized[field] = value;
    }
  }

  for (const field of INTERACTION_ARRAY_FIELDS) {
    const value = normalizeStringArray(record[field]);
    if (value) {
      normalized[field] = value;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeCompanionProfile(profile: CompanionProfile): CompanionProfile {
  const normalized: CompanionProfile = {};

  for (const field of PROFILE_FIELDS) {
    const value = trimField(profile[field]);
    if (value) {
      normalized[field] = value;
    }
  }

  const interactionPreferences = normalizeInteractionPreferences(profile.interactionPreferences);
  if (interactionPreferences) {
    normalized.interactionPreferences = interactionPreferences;
  }

  return normalized;
}

export function hasCompanionProfile(profile: CompanionProfile): boolean {
  return (
    PROFILE_FIELDS.some((field) => Boolean(trimField(profile[field]))) ||
    Boolean(normalizeInteractionPreferences(profile.interactionPreferences))
  );
}

export function loadCompanionProfile(): CompanionProfile {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CompanionProfile;
    return normalizeCompanionProfile(parsed ?? {});
  } catch {
    return {};
  }
}

export function saveCompanionProfile(profile: CompanionProfile): CompanionProfile {
  const normalized = normalizeCompanionProfile(profile);

  if (typeof window !== 'undefined') {
    if (hasCompanionProfile(normalized)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  return normalized;
}

export function appendCompanionProfileToFormData(
  formData: FormData,
  profile: CompanionProfile,
): void {
  const normalized = normalizeCompanionProfile(profile);
  if (!hasCompanionProfile(normalized)) {
    return;
  }

  formData.append('companionProfile', JSON.stringify(normalized));
}
