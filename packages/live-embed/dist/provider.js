'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from 'react';
import { buildEmbedLiveUrl, configureLiveEmbed, getLiveEmbedConfig } from './configure.js';
import { captureElement, getSelectedText, buildNearbyExcerpt } from './capture.js';
import { HostGuideOverlay, mergeLiveGuideUpdate } from './host-overlay.js';
import { isLiveGuideMessage, parseEmbedMessage, sendHostReady } from './post-message.js';
import { EMBED_MESSAGE } from './types.js';
import { useChrystyHostContext } from './host-context.js';
const LiveEmbedContext = createContext(null);
export function useChrystyLiveEmbed() {
    const ctx = useContext(LiveEmbedContext);
    if (!ctx) {
        throw new Error('useChrystyLiveEmbed must be used within ChrystyLiveEmbedProvider');
    }
    return ctx;
}
export function ChrystyLiveEmbedProvider({ children, ...config }) {
    const configKey = `${config.astraEmbedUrl}|${config.worker}|${config.mode ?? 'iframe'}`;
    const lastKeyRef = useRef('');
    if (lastKeyRef.current !== configKey) {
        configureLiveEmbed(config);
        lastKeyRef.current = configKey;
    }
    const [isOpen, setIsOpen] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [statusLine, setStatusLine] = useState(null);
    const [liveGuide, setLiveGuide] = useState(null);
    const [targetRect, setTargetRect] = useState(null);
    const iframeRef = useRef(null);
    const hostReadySentRef = useRef(false);
    const hostCtx = useChrystyHostContext();
    const pushHostPayload = useCallback(async () => {
        const iframe = iframeRef.current;
        if (!iframe || !hostCtx)
            return;
        const selection = getSelectedText();
        const element = hostCtx.captureTarget
            ? document.querySelector(hostCtx.captureTarget)
            : null;
        const fullText = element?.textContent ?? '';
        const context = {
            ...hostCtx.context,
            selectedPassage: selection || hostCtx.context.selectedPassage,
            nearbyExcerpt: hostCtx.context.nearbyExcerpt ??
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
        if (!isOpen)
            return;
        const onMessage = (event) => {
            const { astraEmbedUrl } = getLiveEmbedConfig();
            const allowedOrigin = new URL(astraEmbedUrl).origin;
            const message = parseEmbedMessage(event, allowedOrigin);
            if (!message)
                return;
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
        if (!hostCtx)
            return '';
        return buildEmbedLiveUrl({
            worker: getLiveEmbedConfig().worker,
            entityId: hostCtx.context.entityId,
            title: hostCtx.context.title,
        });
    }, [hostCtx, isOpen]);
    const value = useMemo(() => ({
        openLive,
        closeLive,
        isOpen,
        isConnecting,
        statusLine,
    }), [closeLive, isConnecting, isOpen, openLive, statusLine]);
    return (_jsxs(LiveEmbedContext.Provider, { value: value, children: [children, liveGuide ? (_jsx(HostGuideOverlay, { directives: liveGuide.directives, coachingNote: liveGuide.coachingNote, targetRect: targetRect })) : null, isOpen ? (_jsxs("div", { className: "fixed inset-0 z-[9999] flex flex-col bg-background/80 backdrop-blur-sm", role: "dialog", "aria-label": "Ask Chrysty Live", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 border-b border-border px-4 py-3", children: [_jsx("p", { className: "truncate text-sm font-medium text-foreground", children: statusLine ?? 'Chrysty Live' }), _jsx("button", { type: "button", onClick: closeLive, className: "rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted", children: "Close" })] }), _jsx("iframe", { ref: iframeRef, title: "Chrysty Live", src: embedUrl, className: "min-h-0 flex-1 w-full border-0 bg-background", allow: "microphone; autoplay" })] })) : null] }));
}
