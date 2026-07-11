import type { LiveGuideDirective, LiveGuideUpdate } from './types.js';
interface HostGuideOverlayProps {
    directives: LiveGuideDirective[];
    coachingNote?: string | null;
    /** Bounding rect of the capture target on the host page (viewport coords). */
    targetRect: DOMRect | null;
}
export declare function HostGuideOverlay({ directives, coachingNote, targetRect }: HostGuideOverlayProps): import("react").JSX.Element | null;
export declare function mergeLiveGuideUpdate(previous: LiveGuideUpdate | null, next: LiveGuideUpdate): LiveGuideUpdate;
export {};
//# sourceMappingURL=host-overlay.d.ts.map