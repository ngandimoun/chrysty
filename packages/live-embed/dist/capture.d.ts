import type { ScreenCaptureResult } from './types.js';
export declare function getSelectedText(): string;
export declare function buildNearbyExcerpt(fullText: string, selection: string, maxChars?: number): string;
export declare function resolveCaptureElement(captureTarget?: string): HTMLElement | null;
export declare function captureElement(captureTarget?: string): Promise<ScreenCaptureResult | null>;
export declare function hostContextToUiPayload(context: {
    title: string;
    selectedPassage?: string;
    nearbyExcerpt?: string;
    artifactLanguage?: string;
}): {
    source: 'explanation_canvas';
    title: string;
    selected_passage: string;
    nearby_excerpt: string;
    saved: false;
    artifact_language?: string;
};
//# sourceMappingURL=capture.d.ts.map