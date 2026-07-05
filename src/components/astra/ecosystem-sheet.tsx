'use client';

import { ChevronRight } from 'lucide-react';

import { touchButtonClass } from '@/components/astra/camera-tool-button';
import { WorkerFavicon } from '@/components/astra/worker-favicon';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CHRYSTY_PROD_WORKERS } from '@/lib/astra/chrysty-workers';
import { cn } from '@/lib/utils';

interface EcosystemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EcosystemSheet({ open, onOpenChange }: EcosystemSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        className={cn(
          'max-h-[min(75dvh,32rem)] gap-3 rounded-t-3xl border-border bg-popover text-popover-foreground',
          'pb-[max(1rem,env(safe-area-inset-bottom))]',
        )}
      >
        <div className="mx-auto mt-1 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />

        <SheetHeader className="gap-1.5 px-1 pt-0 text-left">
          <SheetTitle className="text-base font-semibold">Chrysty apps</SheetTitle>
          <SheetDescription className="text-xs">
            Jump to another Chrysty experience.
          </SheetDescription>
        </SheetHeader>

        <nav
          className="flex max-h-[min(52dvh,22rem)] flex-col gap-1.5 overflow-y-auto px-1 [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
          aria-label="Chrysty apps"
        >
          {CHRYSTY_PROD_WORKERS.map((worker) => (
            <a
              key={worker.url}
              href={worker.url}
              className={cn(
                'group flex min-h-13 w-full items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2',
                'bg-muted/50 transition-[background-color,border-color,transform] duration-200',
                'hover:border-border hover:bg-accent active:scale-[0.99]',
                touchButtonClass,
              )}
            >
              <WorkerFavicon name={worker.name} url={worker.url} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {worker.name}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                aria-hidden
              />
            </a>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
