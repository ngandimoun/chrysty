const DANGEROUS_HTML =
  /<\s*(script|iframe|object|embed|form|input|button|textarea|select|link|meta|base|style)\b[^>]*>[\s\S]*?(<\/\1\s*>|\/>)?/gi;

const SELF_CLOSING_DANGEROUS = /<\s*(script|iframe|object|embed|link|meta|base)\b[^>]*\/?>/gi;

const RICH_MARKER_PATTERN =
  /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\*\*[^*]+\*\*|^#{1,3}\s|\|[^\n]+\||:\w+(?:_\w+)*:|\\ce\{)/m;

export function normalizeExplanationMarkdown(text: string): string {
  return text
    .replace(DANGEROUS_HTML, '')
    .replace(SELF_CLOSING_DANGEROUS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasRichMarkers(text: string): boolean {
  return RICH_MARKER_PATTERN.test(text);
}

/** @deprecated Use normalizeExplanationMarkdown */
export function sanitizeExplanationText(text: string): string {
  return normalizeExplanationMarkdown(text);
}
