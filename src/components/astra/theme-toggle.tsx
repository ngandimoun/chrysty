'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { touchButtonClass } from '@/components/astra/camera-tool-button';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
        {THEME_OPTIONS.map(({ value, label }) => (
          <div
            key={value}
            className="h-9 flex-1 rounded-md bg-background/60"
            aria-hidden
          >
            <span className="sr-only">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  const activeTheme = theme ?? 'system';

  return (
    <div
      className="flex gap-1 rounded-lg border border-border bg-muted p-1"
      role="radiogroup"
      aria-label="Color theme"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const isActive = activeTheme === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors',
              touchButtonClass,
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
