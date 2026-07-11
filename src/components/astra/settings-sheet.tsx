'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Palette,
  Plug,
  type LucideIcon,
} from 'lucide-react';

import { touchButtonClass } from '@/components/astra/camera-tool-button';
import { ConnectionPanel } from '@/components/astra/connection-panel';
import { PersonalizationForm } from '@/components/astra/personalization-form';
import { ThemeToggle } from '@/components/astra/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type SettingsView = 'menu' | 'personalization' | 'connection';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialView?: SettingsView;
  composioReturnStatus?: 'connected' | 'error' | null;
  composioReturnToolkit?: string | null;
}

const MENU_ITEMS: { id: Exclude<SettingsView, 'menu'>; label: string; icon: LucideIcon }[] = [
  { id: 'personalization', label: 'Personalization', icon: Palette },
  { id: 'connection', label: 'Connection', icon: Plug },
];

const VIEW_TITLES: Record<Exclude<SettingsView, 'menu'>, string> = {
  personalization: 'Personalization',
  connection: 'Connection',
};

export function SettingsSheet({
  open,
  onOpenChange,
  initialView = 'menu',
  composioReturnStatus = null,
  composioReturnToolkit = null,
}: SettingsSheetProps) {
  const [view, setView] = useState<SettingsView>(initialView);

  useEffect(() => {
    if (open && initialView !== 'menu') {
      setView(initialView);
    }
  }, [open, initialView]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setView('menu');
    }
    onOpenChange(nextOpen);
  };

  const activeTitle = view === 'menu' ? 'Settings' : VIEW_TITLES[view];
  const tallSheet = view === 'personalization' || view === 'connection';

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={view === 'menu'}
        className={cn(
          tallSheet ? 'max-h-[min(90dvh,36rem)]' : 'max-h-[min(85dvh,32rem)]',
          'rounded-t-3xl border-border bg-popover text-popover-foreground',
          'pb-[max(1rem,env(safe-area-inset-bottom))]',
          tallSheet && 'flex flex-col',
        )}
      >
        <SheetHeader className="gap-3 px-1 pt-1">
          <div className="flex items-center gap-2">
            {view !== 'menu' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn('shrink-0 text-foreground hover:bg-accent', touchButtonClass)}
                onClick={() => setView('menu')}
                aria-label="Back to settings menu"
              >
                <ArrowLeft className="size-4" />
              </Button>
            ) : null}
            <SheetTitle>{activeTitle}</SheetTitle>
          </div>
          {view === 'menu' ? (
            <SheetDescription>Manage personalization and connection.</SheetDescription>
          ) : null}
        </SheetHeader>

        {view === 'menu' ? (
          <>
            <div className="px-1">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Appearance
              </p>
              <ThemeToggle />
            </div>
            <nav className="flex flex-col gap-1 px-1" aria-label="Settings sections">
              {MENU_ITEMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground',
                    'transition-colors hover:bg-accent active:bg-accent/80',
                    touchButtonClass,
                  )}
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </nav>
          </>
        ) : view === 'personalization' ? (
          <PersonalizationForm active />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-1 pb-2">
            <ConnectionPanel
              returnStatus={composioReturnStatus}
              returnToolkit={composioReturnToolkit}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
