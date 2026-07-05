import { ExternalLink } from 'lucide-react';

import type { WebCitation } from '@/lib/streaming/types';

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface WebSourcesListProps {
  citations: WebCitation[];
}

export function WebSourcesList({ citations }: WebSourcesListProps) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-border pt-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Sources</p>
      <ul className="mt-2 space-y-2">
        {citations.map((citation, index) => (
          <li
            key={`${citation.url}-${index}`}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-xs font-medium text-muted-foreground">{index + 1}.</span>
              <div className="min-w-0 flex-1">
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-1.5 text-sm font-medium text-primary hover:opacity-80"
                >
                  <span className="line-clamp-2">{citation.title}</span>
                  <ExternalLink
                    className="mt-0.5 size-3.5 shrink-0 opacity-60 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </a>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{domainFromUrl(citation.url)}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
