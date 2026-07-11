import { getLiveEmbedConfig, isAllowedChrystyOrigin } from './configure.js';
import { EMBED_MESSAGE, } from './types.js';
export function postToEmbedIframe(iframe, type, payload) {
    const target = iframe.contentWindow;
    if (!target)
        return;
    const { astraEmbedUrl } = getLiveEmbedConfig();
    target.postMessage({ type, ...payload }, new URL(astraEmbedUrl).origin);
}
export function sendHostReady(iframe, input) {
    postToEmbedIframe(iframe, EMBED_MESSAGE.HOST_READY, {
        context: input.context,
        capture: input.capture ?? null,
        selection: input.selection ?? '',
    });
}
export function sendContextUpdate(iframe, context) {
    postToEmbedIframe(iframe, EMBED_MESSAGE.CONTEXT_UPDATE, { context });
}
export function sendCaptureUpdate(iframe, input) {
    postToEmbedIframe(iframe, EMBED_MESSAGE.CAPTURE_UPDATE, {
        capture: input.capture ?? null,
        selection: input.selection ?? '',
    });
}
export function parseEmbedMessage(event, allowedParentOrigin) {
    if (allowedParentOrigin && event.origin !== allowedParentOrigin) {
        if (!isAllowedChrystyOrigin(event.origin))
            return null;
    }
    else if (!isAllowedChrystyOrigin(event.origin)) {
        return null;
    }
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
        return null;
    }
    const { type, ...payload } = data;
    return { type, payload };
}
export function isLiveGuideMessage(message) {
    if (!message || message.type !== EMBED_MESSAGE.LIVE_GUIDE)
        return null;
    const directives = message.payload.directives;
    if (!Array.isArray(directives))
        return null;
    return {
        directives: directives,
        clearPrevious: message.payload.clearPrevious === true,
        coachingNote: typeof message.payload.coachingNote === 'string' ? message.payload.coachingNote : null,
        spokenText: typeof message.payload.spokenText === 'string' ? message.payload.spokenText : null,
    };
}
