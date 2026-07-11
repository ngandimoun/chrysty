'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from 'react';
import { buildEmbedLiveUrl, configureLiveEmbed, getLiveEmbedConfig } from './configure.js';
import { captureElement, getSelectedText, buildNearbyExcerpt } from './capture.js';
import { HostGuideOverlay, mergeLiveGuideUpdate } from './host-overlay.js';
import { setHostRegistrar } from './host-registry.js';
import { isLiveGuideMessage, parseEmbedMessage, sendCaptureUpdate, sendContextUpdate, sendHostReady, } from './post-message.js';
import { EMBED_MESSAGE, } from './types.js';
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
    const [embedUrl, setEmbedUrl] = useState('');
    const [hostStack, setHostStack] = useState([]);
    const iframeRef = useRef(null);
    const hostReadySentRef = useRef(false);
    const hostCtx = hostStack.length > 0 ? hostStack[hostStack.length - 1].value : null;
    const hostCtxRef = useRef(hostCtx);
    hostCtxRef.current = hostCtx;
    useEffect(() => {
        setHostRegistrar((token, value) => {
            setHostStack((prev) => {
                const idx = prev.findIndex((entry) => entry.token === token);
                if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = { token, value };
                    return next;
                }
                return [...prev, { token, value }];
            });
            return () => {
                setHostStack((prev) => prev.filter((entry) => entry.token !== token));
            };
        });
        return () => setHostRegistrar(null);
    }, []);
    const buildPayloadContext = useCallback((active) => {
        const selection = getSelectedText();
        const element = active.captureTarget
            ? document.querySelector(active.captureTarget)
            : null;
        const fullText = element?.textContent ?? '';
        return {
            context: {
                ...active.context,
                selectedPassage: selection || active.context.selectedPassage,
                nearbyExcerpt: active.context.nearbyExcerpt ??
                    buildNearbyExcerpt(fullText, selection || active.context.selectedPassage || ''),
            },
            selection,
        };
    }, []);
    const pushHostPayload = useCallback(async () => {
        const iframe = iframeRef.current;
        const active = hostCtxRef.current;
        if (!iframe || !active)
            return;
        const { context, selection } = buildPayloadContext(active);
        setStatusLine('Capturing your screen…');
        const capture = await captureElement(active.captureTarget);
        setTargetRect(active.getCaptureTargetRect());
        setStatusLine(capture ? 'Chrysty is ready — talk in the panel below' : 'Chrysty is ready');
        sendHostReady(iframe, { context, capture, selection });
        hostReadySentRef.current = true;
    }, [buildPayloadContext]);
    const pushHostUpdate = useCallback(async () => {
        const iframe = iframeRef.current;
        const active = hostCtxRef.current;
        if (!iframe || !active || !hostReadySentRef.current)
            return;
        const { context, selection } = buildPayloadContext(active);
        sendContextUpdate(iframe, context);
        const capture = await captureElement(active.captureTarget);
        setTargetRect(active.getCaptureTargetRect());
        sendCaptureUpdate(iframe, { capture, selection });
    }, [buildPayloadContext]);
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
                setEmbedUrl('');
                setLiveGuide(null);
                setStatusLine(null);
                hostReadySentRef.current = false;
                return;
            }
            const guide = isLiveGuideMessage(message);
            if (guide) {
                setLiveGuide((prev) => mergeLiveGuideUpdate(prev, guide));
                setTargetRect(hostCtxRef.current?.getCaptureTargetRect() ?? null);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [isOpen, pushHostPayload]);
    // When host context changes while Live is open, update iframe without remounting.
    useEffect(() => {
        if (!isOpen || !hostReadySentRef.current || !hostCtx)
            return;
        void pushHostUpdate();
    }, [hostCtx, isOpen, pushHostUpdate]);
    const openLive = useCallback(async () => {
        const active = hostCtxRef.current;
        if (!active) {
            setStatusLine('Missing page context');
            return;
        }
        hostReadySentRef.current = false;
        setIsConnecting(true);
        setLiveGuide(null);
        setStatusLine('Opening Chrysty Live…');
        setEmbedUrl(buildEmbedLiveUrl({
            worker: getLiveEmbedConfig().worker,
            entityId: active.context.entityId,
            title: active.context.title,
        }));
        setIsOpen(true);
    }, []);
    const closeLive = useCallback(() => {
        setIsOpen(false);
        setEmbedUrl('');
        setLiveGuide(null);
        setStatusLine(null);
        hostReadySentRef.current = false;
    }, []);
    const value = useMemo(() => ({
        openLive,
        closeLive,
        isOpen,
        isConnecting,
        statusLine,
        hasHostContext: hostCtx !== null,
    }), [closeLive, hostCtx, isConnecting, isOpen, openLive, statusLine]);
    return (_jsxs(LiveEmbedContext.Provider, { value: value, children: [children, liveGuide ? (_jsx(HostGuideOverlay, { directives: liveGuide.directives, coachingNote: liveGuide.coachingNote, targetRect: targetRect })) : null, isOpen && embedUrl ? (_jsxs("div", { className: "fixed bottom-24 right-6 z-[9999] flex w-[min(24rem,calc(100vw-2rem))] h-[min(32rem,calc(100vh-8rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl", role: "dialog", "aria-label": "Ask Chrysty Live", children: [_jsxs("div", { className: "flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2", children: [_jsx("p", { className: "truncate text-sm font-medium text-foreground", children: statusLine ?? 'Chrysty Live' }), _jsx("button", { type: "button", onClick: closeLive, className: "rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted", children: "Close" })] }), _jsx("iframe", { ref: iframeRef, title: "Chrysty Live", src: embedUrl, className: "min-h-0 flex-1 w-full border-0 bg-background", allow: "microphone; autoplay" })] })) : null] }));
}
