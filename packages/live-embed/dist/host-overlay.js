'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function emphasisStroke(emphasis) {
    if (emphasis === 'warning')
        return '#fbbf24';
    if (emphasis === 'secondary')
        return '#94a3b8';
    return '#38bdf8';
}
function toPixelPoints(directive, rect) {
    return directive.points.map((point) => ({
        x: rect.left + point.x * rect.width,
        y: rect.top + point.y * rect.height,
    }));
}
export function HostGuideOverlay({ directives, coachingNote, targetRect }) {
    if (!targetRect || directives.length === 0)
        return null;
    return (_jsxs("div", { className: "pointer-events-none fixed inset-0 z-[9998]", "aria-hidden": true, children: [_jsx("svg", { className: "absolute inset-0 size-full overflow-visible", children: directives.map((directive) => {
                    const points = toPixelPoints(directive, targetRect);
                    const stroke = emphasisStroke(directive.emphasis);
                    if (directive.kind === 'pointer' && points[0]) {
                        const p = points[0];
                        return (_jsxs("g", { children: [_jsx("circle", { cx: p.x, cy: p.y, r: 28, fill: "none", stroke: stroke, strokeWidth: 2.5, opacity: 0.85 }), _jsx("circle", { cx: p.x, cy: p.y, r: 6, fill: stroke })] }, directive.id));
                    }
                    if (directive.kind === 'region' && points.length >= 2) {
                        const [a, b] = points;
                        const x = Math.min(a.x, b.x);
                        const y = Math.min(a.y, b.y);
                        const w = Math.abs(b.x - a.x);
                        const h = Math.abs(b.y - a.y);
                        return (_jsx("rect", { x: x, y: y, width: w, height: h, fill: `${stroke}22`, stroke: stroke, strokeWidth: 2, rx: 8 }, directive.id));
                    }
                    if (directive.kind === 'path' && points.length >= 2) {
                        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                        return (_jsx("path", { d: d, fill: "none", stroke: stroke, strokeWidth: 2.5, strokeLinecap: "round" }, directive.id));
                    }
                    return null;
                }) }), coachingNote ? (_jsx("div", { className: "absolute max-w-xs rounded-xl border border-border bg-background/95 px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-sm", style: {
                    left: Math.min(targetRect.left, window.innerWidth - 280),
                    top: Math.max(8, targetRect.top - 48),
                }, children: coachingNote })) : null] }));
}
export function mergeLiveGuideUpdate(previous, next) {
    if (next.clearPrevious)
        return next;
    return {
        ...next,
        directives: [...(previous?.directives ?? []), ...next.directives].slice(-12),
    };
}
