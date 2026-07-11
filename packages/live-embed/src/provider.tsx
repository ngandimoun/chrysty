'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { buildEmbedLiveUrl, configureLiveEmbed, getLiveEmbedConfig } from './configure.js';
import { captureElement, getSelectedText, buildNearbyExcerpt } from './capture.js';
import { HostGuideOverlay, mergeLiveGuideUpdate } from './host-overlay.js';
import { isLiveGuideMessage, parseEmbedMessage, sendHostReady } from './post-message.js';
import { EMBED_MESSAGE, type LiveEmbedConfig, type LiveGuideUpdate } from './types.js';
import { useChrystyHostContext } from './host-context.js';

interface LiveEmbedContextValue {
  openLive: () => Promise<void>;
  closeLive: () => void;
  isOpen: boolean;
  isConnecting: boolean;
  statusLine: string | null;
}

const LiveEmbedContext = createContext<LiveEmbedContextValue | null>(null);

export function useChrystyLiveEmbed(): LiveEmbedContextValue {
  const ctx = useContext(LiveEmbedContext);
  if (!ctx) {
    throw new Error('useChrystyLiveEmbed must be used within ChrystyLiveEmbedProvider');
  }
  return ctx;
}

interface ChrystyLiveEmbedProviderProps extends LiveEmbedConfig {
  children: ReactNode;
}

export function ChrystyLiveEmbedProvider({ children, ...config }: ChrystyLiveEmbedProviderProps) {
  const configKey = `${config.astraEmbedUrl}|${config.worker}|${config.mode ?? 'iframe'}`;
  const lastKeyRef = useRef('');

  if (lastKeyRef.current !== configKey) {
    configureLiveEmbed(config);
    lastKeyRef.current = configKey;
  }

  const [isOpen, setIsOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [liveGuide, setLiveGuide] = useState<LiveGuideUpdate | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hostReadySentRef = useRef(false);
  const hostCtx = useChrystyHostContext();

  const pushHostPayload = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe || !hostCtx) return;

    const selection = getSelectedText();
    const element = hostCtx.captureTarget
      ? document.querySelector(hostCtx.captureTarget)
      : null;
    const fullText = element?.textContent ?? '';
    const context = {
      ...hostCtx.context,
      selectedPassage: selection || hostCtx.context.selectedPassage,
      nearbyExcerpt:
        hostCtx.context.nearbyExcerpt ??
        buildNearbyExcerpt(fullText, selection || hostCtx.context.selectedPassage || ''),
    };

    setStatusLine('Capturing your screen…');
    const capture = await captureElement(hostCtx.captureTarget);
    setTargetRect(hostCtx.getCaptureTargetRect());
    setStatusLine(capture ? 'Chrysty is ready — talk in the panel below' : 'Chrysty is ready');

    sendHostReady(iframe, { context, capture, selection });
    hostReadySentRef.current = true;
  }, [hostCtx]);

  useEffect(() => {
    if (!isOpen) return;

    const onMessage = (event: MessageEvent) => {
      const { astraEmbedUrl } = getLiveEmbedConfig();
      const allowedOrigin = new URL(astraEmbedUrl).origin;
      const message = parseEmbedMessage(event, allowedOrigin);
      if (!message) return;

      if (message.type === EMBED_MESSAGE.EMBED_READY) {
        setIsConnecting(false);
        void pushHostPayload();
        return;
      }
      if (message.type === EMBED_MESSAGE.CONNECTED) {
        setStatusLine('Live');
        return;
      }
      if (message.type === EMBED_MESSAGE.SPEAKING) {
        const speaking = message.payload.speaking === true;
        setStatusLine(speaking ? 'Chrysty is speaking…' : 'Listening…');
        return;
      }
      if (message.type === EMBED_MESSAGE.CLOSED) {
        setIsOpen(false);
        setLiveGuide(null);
        setStatusLine(null);
        return;
      }
      const guide = isLiveGuideMessage(message);
      if (guide) {
        setLiveGuide((prev) => mergeLiveGuideUpdate(prev, guide));
        setTargetRect(hostCtx?.getCaptureTargetRect() ?? null);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [hostCtx, isOpen, pushHostPayload]);

  const openLive = useCallback(async () => {
    if (!hostCtx) {
      setStatusLine('Missing page context');
      return;
    }
    hostReadySentRef.current = false;
    setIsConnecting(true);
    setLiveGuide(null);
    setStatusLine('Opening Chrysty Live…');
    setIsOpen(true);
  }, [hostCtx]);

  const closeLive = useCallback(() => {
    setIsOpen(false);
    setLiveGuide(null);
    setStatusLine(null);
    hostReadySentRef.current = false;
  }, []);

  const embedUrl = useMemo(() => {
    if (!hostCtx) return '';
    return buildEmbedLiveUrl({
      worker: getLiveEmbedConfig().worker,
      entityId: hostCtx.context.entityId,
      title: hostCtx.context.title,
    });
  }, [hostCtx, isOpen]);

  const value = useMemo(
    (): LiveEmbedContextValue => ({
      openLive,
      closeLive,
      isOpen,
      isConnecting,
      statusLine,
    }),
    [closeLive, isConnecting, isOpen, openLive, statusLine],
  );

  return (
    <LiveEmbedContext.Provider value={value}>
      {children}
      {liveGuide ? (
        <HostGuideOverlay
          directives={liveGuide.directives}
          coachingNote={liveGuide.coachingNote}
          targetRect={targetRect}
        />
      ) : null}
      {isOpen ? (
        <div
          className="fixed inset-0 z-[9999] flex flex-col bg-background/80 backdrop-blur-sm"
          role="dialog"
          aria-label="Ask Chrysty Live"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-foreground">
              {statusLine ?? 'Chrysty Live'}
            </p>
            <button
              type="button"
              onClick={closeLive}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              Close
            </button>
          </div>
          <iframe
            ref={iframeRef}
            title="Chrysty Live"
            src={embedUrl}
            className="min-h-0 flex-1 w-full border-0 bg-background"
            allow="microphone; autoplay"
          />
        </div>
      ) : null}
    </LiveEmbedContext.Provider>
  );
}
