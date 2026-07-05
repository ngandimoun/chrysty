import {
  hasCompanionProfile,
  normalizeCompanionProfile,
  type CompanionProfile,
} from '@/lib/client/companion-profile';

export type { CompanionProfile };

export function parseCompanionProfileFromFormData(formData: FormData): CompanionProfile | undefined {
  const raw = String(formData.get('companionProfile') ?? '').trim();
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as CompanionProfile;
    const normalized = normalizeCompanionProfile(parsed ?? {});
    return hasCompanionProfile(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function joinList(values: string[] | undefined): string | null {
  return values && values.length > 0 ? values.join(', ') : null;
}

const RESPONSE_DEPTH_GUIDANCE: Record<string, string> = {
  'Quick replies with minimal detail':
    'Voice: 1–2 sentences. Use needs_visual_explanation only when essential for lists, steps, or comparisons.',
  'Balanced answers with useful context':
    'Voice: 2–5 sentences with the answer, one reason or check, and next step when relevant. Use needs_visual_explanation for substantive explanations, comparisons, and multi-step help.',
  'Deep explanations with examples and reasoning':
    'Prefer needs_visual_explanation true. Voice: include an example or key reasoning. explanation_text: use headings and ordered steps where helpful.',
  'Ask before giving a long answer':
    'Ask one clarifying question in voice unless the user said "just tell me" or clearly wants the full answer now.',
};

function buildResponseDepthGuide(responseDepth: string): string | null {
  return RESPONSE_DEPTH_GUIDANCE[responseDepth] ?? null;
}

export function buildCompanionProfileBlock(profile: CompanionProfile): string {
  const lines: string[] = [
    'User companion profile (use to personalize; do not invent facts):',
  ];

  if (profile.preferredName) {
    lines.push(`- Preferred name: ${profile.preferredName}`);
  }
  if (profile.occupation) {
    lines.push(`- Occupation / role: ${profile.occupation}`);
  }
  if (profile.foodPreferences) {
    lines.push(`- Food & diet: ${profile.foodPreferences}`);
  }
  if (profile.healthNotes) {
    lines.push(`- Health & allergies: ${profile.healthNotes}`);
  }
  if (profile.interests) {
    lines.push(`- Interests: ${profile.interests}`);
  }
  if (profile.topicsToAvoid) {
    lines.push(`- Topics to avoid: ${profile.topicsToAvoid}`);
  }

  const preferences = profile.interactionPreferences;
  if (preferences) {
    lines.push('', 'User interaction preferences (apply when they fit the current request):');
    if (preferences.responseDepth) {
      lines.push(`- Response depth: ${preferences.responseDepth}`);
      const depthGuide = buildResponseDepthGuide(preferences.responseDepth);
      if (depthGuide) {
        lines.push(`- Response depth guidance: ${depthGuide}`);
      }
    }
    const tones = joinList(preferences.tones);
    if (tones) {
      lines.push(`- Tone: ${tones}`);
    }
    if (preferences.customTone) {
      lines.push(`- Custom tone: ${preferences.customTone}`);
    }
    if (preferences.relationshipMode) {
      lines.push(`- Relationship mode: ${preferences.relationshipMode}`);
    }
    const guidanceStyles = joinList(preferences.guidanceStyles);
    if (guidanceStyles) {
      lines.push(`- Guidance style: ${guidanceStyles}`);
    }
    const expertiseLenses = joinList(preferences.expertiseLenses);
    if (expertiseLenses) {
      lines.push(`- Expertise lens: ${expertiseLenses}`);
    }
    if (preferences.customExpertise) {
      lines.push(`- Custom role or lens: ${preferences.customExpertise}`);
    }
    if (preferences.outputFormat) {
      lines.push(`- Output format: ${preferences.outputFormat}`);
    }
    if (preferences.customInstruction) {
      lines.push(`- Custom interaction instruction: ${preferences.customInstruction}`);
    }
  }

  lines.push(
    '- Honor topics to avoid; do not bring them up unless the user does.',
    '- Treat health notes sensitively; never diagnose or give medical advice beyond general awareness.',
    '- Address the user by their preferred name when natural.',
    '- Interaction preferences guide style and framing only; they never override truthfulness, safety, consent, the user\'s current request, or the user\'s language.',
    '- If an affectionate or playful relationship mode is selected, keep it respectful, non-explicit, and appropriate for a voice assistant.',
  );

  return lines.join('\n');
}
