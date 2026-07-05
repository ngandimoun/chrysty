'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Components } from 'react-markdown';

const katexSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ['className'], ['style'], ['ariaHidden']],
    div: [...(defaultSchema.attributes?.div ?? []), ['className']],
    math: [...(defaultSchema.attributes?.math ?? []), ['xmlns']],
    annotation: [...(defaultSchema.attributes?.annotation ?? []), ['encoding']],
    semantics: [...(defaultSchema.attributes?.semantics ?? []), ['className']],
    mrow: [...(defaultSchema.attributes?.mrow ?? []), ['className']],
    mi: [...(defaultSchema.attributes?.mi ?? []), ['className']],
    mo: [...(defaultSchema.attributes?.mo ?? []), ['className']],
    mn: [...(defaultSchema.attributes?.mn ?? []), ['className']],
    mfrac: [...(defaultSchema.attributes?.mfrac ?? []), ['className']],
    msup: [...(defaultSchema.attributes?.msup ?? []), ['className']],
    msub: [...(defaultSchema.attributes?.msub ?? []), ['className']],
    msubsup: [...(defaultSchema.attributes?.msubsup ?? []), ['className']],
    msqrt: [...(defaultSchema.attributes?.msqrt ?? []), ['className']],
    mtext: [...(defaultSchema.attributes?.mtext ?? []), ['className']],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'math',
    'semantics',
    'mrow',
    'mi',
    'mo',
    'mn',
    'mfrac',
    'msup',
    'msub',
    'msubsup',
    'msqrt',
    'mtext',
    'annotation',
  ],
};

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-lg font-semibold tracking-tight text-foreground first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-base font-semibold text-foreground first:mt-0">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/50 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
          {children}
        </code>
      );
    }

    return (
      <code className="rounded-md bg-muted px-1.5 py-0.5 text-sm text-foreground">{children}</code>
    );
  },
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted text-foreground">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
  tr: ({ children }) => <tr className="even:bg-muted/50">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-2 text-foreground">{children}</td>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="text-foreground">{children}</li>,
  p: ({ children }) => <p className="my-2 leading-relaxed text-foreground first:mt-0 last:mb-0">{children}</p>,
};

interface RichExplanationContentProps {
  text: string;
}

export function RichExplanationContent({ text }: RichExplanationContentProps) {
  const [katexReady, setKatexReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await import('katex/dist/contrib/mhchem.min.js');
      if (!cancelled) {
        setKatexReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!katexReady) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
        <div className="h-4 w-4/6 rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="explanation-prose prose prose-sm sm:prose-base dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkEmoji]}
        rehypePlugins={[rehypeKatex, [rehypeSanitize, katexSanitizeSchema]]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
