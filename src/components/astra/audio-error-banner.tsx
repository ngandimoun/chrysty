'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { MicErrorCode } from '@/lib/audio/mic';

interface AudioErrorBannerProps {
  message: string | null;
  code?: MicErrorCode;
  onDismiss?: () => void;
}

const MKCERT_MOBILE_URL = 'https://github.com/FiloSottile/mkcert#mobile-devices';

export function AudioErrorBanner({ message, code, onDismiss }: AudioErrorBannerProps) {
  const showSafariHint = code === 'pwa-stuck' || code === 'permission-denied';
  const showHttpsHint = code === 'insecure-context';
  const showIosRetryHint = code === 'unknown';
  const lanHost = typeof window !== 'undefined' ? window.location.hostname : 'YOUR-IP';

  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="mx-auto w-full max-w-md rounded-2xl border border-red-400/20 bg-red-950/40 px-4 py-3 text-sm text-red-100 backdrop-blur-md"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-300" aria-hidden />
            <div className="space-y-2">
              <p>{message}</p>
              {showHttpsHint ? (
                <ol className="list-decimal space-y-1 pl-4 text-xs text-red-200/80">
                  <li>On your PC: run `pnpm certs:install` then `pnpm dev:https`</li>
                  <li>
                    On iPad Safari: open{' '}
                    <span className="font-mono text-red-100">{`https://${lanHost}:3000`}</span> (not http)
                  </li>
                  <li>
                    If Safari warns about the certificate, install the mkcert root CA on iPad (one-time).
                  </li>
                </ol>
              ) : null}
              {showSafariHint ? (
                <p className="text-xs text-red-200/80">
                  On iPhone, if the installed app fails to access the mic, open the site in Safari and
                  try again.
                </p>
              ) : null}
              {showIosRetryHint ? (
                <p className="text-xs text-red-200/80">
                  On iPad or iPhone, allow microphone access in Settings for Safari or Chrome, close other
                  apps that may be using the mic, then tap Record again.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {onDismiss ? (
                  <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
                    Dismiss
                  </Button>
                ) : null}
                {showHttpsHint ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => window.open(MKCERT_MOBILE_URL, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="size-3.5" />
                    mkcert on iPad
                  </Button>
                ) : null}
                {code === 'pwa-stuck' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => window.open(window.location.href, '_blank')}
                  >
                    <ExternalLink className="size-3.5" />
                    Open in browser
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
