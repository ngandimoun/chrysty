import type { RetrievedMemory } from '@/lib/mem0/types';

const DEFAULT_MAX_MEMORIES = 6;
const DEFAULT_MAX_MEMORY_CHARS = 220;

const LOW_INFORMATION_TURNS = new Set([
  'hi',
  'hello',
  'hey',
  'yo',
  'good morning',
  'good afternoon',
  'good evening',
  'thanks',
  'thank you',
  'ok',
  'okay',
  'yes',
  'no',
  'cool',
  'great',
  'nice',
  'bye',
  'goodbye',
]);

const NAME_OR_IDENTITY_PATTERNS = [
  /\bwhat(?:'s| is) your name\b/,
  /\btell me your name\b/,
  /\bwho are you\b/,
  /\bare you chrysty\b/,
  /\bis this chrysty\b/,
];

function normalizeSpeech(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLowInformationTranscript(transcript: string): boolean {
  const normalized = normalizeSpeech(transcript);
  if (!normalized) {
    return true;
  }

  if (LOW_INFORMATION_TURNS.has(normalized)) {
    return true;
  }

  if (/^(um+|uh+|hmm+|mm+|ah+|er+)$/.test(normalized)) {
    return true;
  }

  return NAME_OR_IDENTITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function shouldUseMem0ForTranscript(transcript: string): boolean {
  return !isLowInformationTranscript(transcript);
}

function truncateMemory(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function memoryKey(value: string): string {
  return normalizeSpeech(value).replace(/\s+/g, ' ');
}

export function prepareMemoriesForPrompt(
  memories: RetrievedMemory[],
  options?: { maxMemories?: number; maxChars?: number },
): RetrievedMemory[] {
  const maxMemories = options?.maxMemories ?? DEFAULT_MAX_MEMORIES;
  const maxChars = options?.maxChars ?? DEFAULT_MAX_MEMORY_CHARS;
  const seen = new Set<string>();
  const prepared: RetrievedMemory[] = [];

  for (const memory of memories) {
    const text = memory.memory.trim();
    if (!text) {
      continue;
    }

    const key = memoryKey(text);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    prepared.push({
      ...memory,
      memory: truncateMemory(text, maxChars),
    });

    if (prepared.length >= maxMemories) {
      break;
    }
  }

  return prepared;
}
