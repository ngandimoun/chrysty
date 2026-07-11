'use client';

import { MessageCircle } from 'lucide-react';

import { useChrystyLiveEmbed } from './provider.js';
import { useChrystyHostContext } from './host-context.js';

interface AskChrystyButtonProps {
  className?: string;
  label?: string;
}

export function AskChrystyButton({
  className = '',
  label = 'Ask Chrysty',
}: AskChrystyButtonProps) {
  const hostCtx = useChrystyHostContext();
  const { openLive, isOpen, isConnecting } = useChrystyLiveEmbed();

  if (!hostCtx) return null;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={isOpen || isConnecting}
      onClick={() => void openLive()}
      className={`fixed bottom-6 right-6 z-[9990] flex size-14 items-center justify-center rounded-full border border-border bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-60 ${className}`}
    >
      <MessageCircle className="size-6" aria-hidden />
      <span className="sr-only">{label}</span>
    </button>
  );
}
