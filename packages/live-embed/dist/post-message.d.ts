import { type HostUiContext, type LiveGuideUpdate, type ScreenCaptureResult } from './types.js';
export declare function postToEmbedIframe(iframe: HTMLIFrameElement, type: string, payload: Record<string, unknown>): void;
export declare function sendHostReady(iframe: HTMLIFrameElement, input: {
    context: HostUiContext;
    capture?: ScreenCaptureResult | null;
    selection?: string;
}): void;
export declare function sendContextUpdate(iframe: HTMLIFrameElement, context: HostUiContext): void;
export declare function sendCaptureUpdate(iframe: HTMLIFrameElement, input: {
    capture?: ScreenCaptureResult | null;
    selection?: string;
}): void;
export declare function parseEmbedMessage(event: MessageEvent, allowedParentOrigin?: string): {
    type: string;
    payload: Record<string, unknown>;
} | null;
export declare function isLiveGuideMessage(message: {
    type: string;
    payload: Record<string, unknown>;
} | null): LiveGuideUpdate | null;
//# sourceMappingURL=post-message.d.ts.map