import type { VoiceResponsePayload } from '@/lib/gemini/voice-response-schema';

const EXPLANATION_SUMMARY_MAX_CHARS = 300;

function stripMarkdownForSummary(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\$+/g, '')
    .replace(/\\ce\{[^}]+\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateSummary(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const truncated = text.slice(0, maxChars).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  const clean =
    lastSpace > maxChars * 0.6 ? truncated.slice(0, lastSpace).trimEnd() : truncated;

  return `${clean}…`;
}

export function buildAssistantContextText(payload: VoiceResponsePayload): string {
  const spoken = payload.spoken_transcript.trim();
  if (!spoken) {
    return '';
  }

  if (!payload.needs_visual_explanation || !payload.explanation_text.trim()) {
    return spoken;
  }

  const summary = truncateSummary(
    stripMarkdownForSummary(payload.explanation_text),
    EXPLANATION_SUMMARY_MAX_CHARS,
  );

  if (!summary) {
    return spoken;
  }

  return `${spoken}\n\nOn screen: ${summary}`;
}
