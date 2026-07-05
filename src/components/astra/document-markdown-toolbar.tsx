'use client';

import type { ReactNode } from 'react';
import {
  Bold,
  Code,
  Code2,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { MarkdownEditAction } from '@/lib/documents/markdown-editing';
import { cn } from '@/lib/utils';

interface ToolbarAction {
  action: MarkdownEditAction;
  label: string;
  icon: ReactNode;
}

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  [
    { action: 'bold', label: 'Bold', icon: <Bold className="size-3.5" aria-hidden /> },
    { action: 'italic', label: 'Italic', icon: <Italic className="size-3.5" aria-hidden /> },
    {
      action: 'strikethrough',
      label: 'Strikethrough',
      icon: <Strikethrough className="size-3.5" aria-hidden />,
    },
    { action: 'inlineCode', label: 'Inline code', icon: <Code className="size-3.5" aria-hidden /> },
  ],
  [
    { action: 'heading2', label: 'Heading 2', icon: <Heading2 className="size-3.5" aria-hidden /> },
    { action: 'heading3', label: 'Heading 3', icon: <Heading3 className="size-3.5" aria-hidden /> },
    { action: 'bulletList', label: 'Bullet list', icon: <List className="size-3.5" aria-hidden /> },
    {
      action: 'numberedList',
      label: 'Numbered list',
      icon: <ListOrdered className="size-3.5" aria-hidden />,
    },
    { action: 'blockquote', label: 'Blockquote', icon: <Quote className="size-3.5" aria-hidden /> },
  ],
  [
    { action: 'link', label: 'Link', icon: <Link2 className="size-3.5" aria-hidden /> },
    { action: 'codeBlock', label: 'Code block', icon: <Code2 className="size-3.5" aria-hidden /> },
  ],
];

interface DocumentMarkdownToolbarProps {
  disabled?: boolean;
  onAction: (action: MarkdownEditAction) => void;
  className?: string;
}

export function DocumentMarkdownToolbar({
  disabled = false,
  onAction,
  className,
}: DocumentMarkdownToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted p-1',
        className,
      )}
      role="toolbar"
      aria-label="Formatting"
    >
      {TOOLBAR_GROUPS.map((group, groupIndex) => (
        <div key={groupIndex} className="flex shrink-0 items-center gap-0.5">
          {groupIndex > 0 ? (
            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
          ) : null}
          {group.map((item) => (
            <Button
              key={item.action}
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              onClick={() => onAction(item.action)}
              aria-label={item.label}
              title={item.label}
              className="size-7 shrink-0 rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              {item.icon}
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}
