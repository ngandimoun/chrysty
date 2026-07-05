const DEADLINE_EXCEEDED_PATTERN = /deadline exceeded after (\d+)ms/i;
const GEMINI_MODEL_PATTERN = /gemini-[a-z0-9.-]+/gi;

const GENERIC_ERROR = 'Something went wrong. Try again.';

export function formatUserFacingGeminiError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return GENERIC_ERROR;
  }

  const deadlineMatch = trimmed.match(DEADLINE_EXCEEDED_PATTERN);
  if (deadlineMatch) {
    return `Chrysty took too long to respond (${deadlineMatch[1]} ms). Try again.`;
  }

  const withoutModels = trimmed.replace(GEMINI_MODEL_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
  if (!withoutModels || /gemini/i.test(withoutModels)) {
    return GENERIC_ERROR;
  }

  return withoutModels;
}
