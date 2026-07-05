export type MarkdownEditAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'blockquote'
  | 'link'
  | 'codeBlock';

export interface TextSelection {
  start: number;
  end: number;
}

export interface MarkdownEditResult {
  nextValue: string;
  selectionStart: number;
  selectionEnd: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getLineRange(value: string, index: number): { lineStart: number; lineEnd: number } {
  const lineStart = value.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  const nextBreak = value.indexOf('\n', index);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  return { lineStart, lineEnd };
}

export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
): MarkdownEditResult {
  const safeStart = clamp(start, 0, value.length);
  const safeEnd = clamp(end, 0, value.length);
  const selected = value.slice(safeStart, safeEnd);
  const placeholder = selected || 'text';
  const wrapped = `${before}${placeholder}${after}`;
  const nextValue = value.slice(0, safeStart) + wrapped + value.slice(safeEnd);
  const selectionStart = safeStart + before.length;
  const selectionEnd = selectionStart + placeholder.length;
  return { nextValue, selectionStart, selectionEnd };
}

export function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
  numbered = false,
): MarkdownEditResult {
  const safeStart = clamp(start, 0, value.length);
  const safeEnd = clamp(end, 0, value.length);
  const rangeStart = getLineRange(value, safeStart).lineStart;
  const rangeEnd = getLineRange(value, safeEnd).lineEnd;
  const block = value.slice(rangeStart, rangeEnd);
  const lines = block.split('\n');

  let nextBlock: string;
  if (numbered) {
    nextBlock = lines
      .map((line, index) => {
        const stripped = line.replace(/^\d+\.\s+/, '');
        return `${index + 1}. ${stripped}`;
      })
      .join('\n');
  } else {
    nextBlock = lines
      .map((line) => {
        const stripped = line.replace(/^>\s+/, '').replace(/^[-*]\s+/, '');
        return `${prefix}${stripped}`;
      })
      .join('\n');
  }

  const nextValue = value.slice(0, rangeStart) + nextBlock + value.slice(rangeEnd);
  const delta = nextBlock.length - block.length;
  return {
    nextValue,
    selectionStart: safeStart + delta,
    selectionEnd: safeEnd + delta,
  };
}

export function insertLink(value: string, start: number, end: number): MarkdownEditResult {
  const safeStart = clamp(start, 0, value.length);
  const safeEnd = clamp(end, 0, value.length);
  const selected = value.slice(safeStart, safeEnd);
  const label = selected || 'link text';
  const inserted = `[${label}](url)`;
  const nextValue = value.slice(0, safeStart) + inserted + value.slice(safeEnd);
  const urlStart = safeStart + label.length + 3;
  const urlEnd = urlStart + 3;
  return { nextValue, selectionStart: urlStart, selectionEnd: urlEnd };
}

export function insertCodeBlock(value: string, start: number, end: number): MarkdownEditResult {
  const safeStart = clamp(start, 0, value.length);
  const safeEnd = clamp(end, 0, value.length);
  const selected = value.slice(safeStart, safeEnd);
  const body = selected || 'code';
  const inserted = `\`\`\`\n${body}\n\`\`\``;
  const nextValue = value.slice(0, safeStart) + inserted + value.slice(safeEnd);
  const selectionStart = safeStart + 4;
  const selectionEnd = selectionStart + body.length;
  return { nextValue, selectionStart, selectionEnd };
}

export function applyMarkdownEdit(
  value: string,
  selection: TextSelection,
  action: MarkdownEditAction,
): MarkdownEditResult {
  const { start, end } = selection;

  switch (action) {
    case 'bold':
      return wrapSelection(value, start, end, '**', '**');
    case 'italic':
      return wrapSelection(value, start, end, '*', '*');
    case 'strikethrough':
      return wrapSelection(value, start, end, '~~', '~~');
    case 'inlineCode':
      return wrapSelection(value, start, end, '`', '`');
    case 'heading2':
      return prefixLines(value, start, end, '## ');
    case 'heading3':
      return prefixLines(value, start, end, '### ');
    case 'bulletList':
      return prefixLines(value, start, end, '- ');
    case 'numberedList':
      return prefixLines(value, start, end, '', true);
    case 'blockquote':
      return prefixLines(value, start, end, '> ');
    case 'link':
      return insertLink(value, start, end);
    case 'codeBlock':
      return insertCodeBlock(value, start, end);
    default:
      return { nextValue: value, selectionStart: start, selectionEnd: end };
  }
}

export function restoreTextareaSelection(
  textarea: HTMLTextAreaElement,
  selectionStart: number,
  selectionEnd: number,
): void {
  textarea.focus();
  textarea.setSelectionRange(selectionStart, selectionEnd);
}
