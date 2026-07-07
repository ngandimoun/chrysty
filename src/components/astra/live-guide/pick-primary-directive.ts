import type { LiveGuideDirective } from '@/lib/gemini/voice-response-schema';

export function pickPrimaryDirective(directives: LiveGuideDirective[]): LiveGuideDirective | null {
  if (directives.length === 0) return null;

  const pointers = directives.filter((directive) => directive.kind === 'pointer');
  if (pointers.length === 0) return directives[0] ?? null;

  const primary = pointers.find((directive) => directive.emphasis === 'primary');
  if (primary) return primary;

  const sorted = [...pointers].sort(
    (left, right) => (left.sequence ?? 99) - (right.sequence ?? 99),
  );
  return sorted[0] ?? null;
}
