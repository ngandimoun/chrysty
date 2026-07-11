'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { X } from 'lucide-react';
import { useChrystyLiveEmbed } from './provider.js';
/** Exact Astra AuraCssFallback mark from agent-audio-visualizer-aura.tsx */
function AskChrystyAuraMark({ className = '' }) {
    return (_jsx("div", { className: `relative flex size-8 items-center justify-center ${className}`, "aria-hidden": true, children: _jsxs("div", { className: "relative size-[88%]", children: [_jsx("div", { className: "absolute inset-0 animate-pulse rounded-full bg-cyan-500/15" }), _jsx("div", { className: "absolute inset-[12%] animate-ping rounded-full border-2 border-cyan-400/30 animation-duration-[3s]" }), _jsx("div", { className: "absolute inset-[22%] rounded-full border border-cyan-300/50 shadow-[0_0_48px_rgba(31,213,249,0.35)]" })] }) }));
}
export function AskChrystyButton({ className = '', label = 'Ask Chrysty', }) {
    const { openLive, closeLive, isOpen, isConnecting, hasHostContext } = useChrystyLiveEmbed();
    if (!hasHostContext)
        return null;
    const ariaLabel = isOpen ? 'Close Ask Chrysty' : label;
    return (_jsxs("button", { type: "button", "aria-label": ariaLabel, "aria-pressed": isOpen, disabled: isConnecting && !isOpen, onClick: () => {
            if (isOpen) {
                closeLive();
                return;
            }
            void openLive();
        }, className: `fixed bottom-6 right-6 z-[9990] flex size-14 items-center justify-center overflow-hidden rounded-full border border-border shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-60 ${isOpen
            ? 'bg-muted text-foreground ring-2 ring-primary/60'
            : 'bg-primary text-primary-foreground'} ${className}`, children: [isOpen ? _jsx(X, { className: "size-6", "aria-hidden": true }) : _jsx(AskChrystyAuraMark, {}), _jsx("span", { className: "sr-only", children: ariaLabel })] }));
}
