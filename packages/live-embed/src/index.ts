export { configureLiveEmbed, buildEmbedLiveUrl, getLiveEmbedConfig, isAllowedChrystyOrigin } from './configure.js';
export { ChrystyLiveEmbedProvider, useChrystyLiveEmbed } from './provider.js';
export { ChrystyHostContext, useChrystyHostContext } from './host-context.js';
export { AskChrystyButton } from './ask-button.js';
export { captureElement, getSelectedText, buildNearbyExcerpt, hostContextToUiPayload, resolveCaptureElement } from './capture.js';
export { postToEmbedIframe, sendHostReady, sendContextUpdate, sendCaptureUpdate, parseEmbedMessage, isLiveGuideMessage } from './post-message.js';
export { HostGuideOverlay, mergeLiveGuideUpdate } from './host-overlay.js';
export { EMBED_MESSAGE } from './types.js';
export type {
  FocusAnnotation,
  FocusAnnotationShape,
  HostContextValue,
  HostUiContext,
  LiveEmbedConfig,
  LiveGuideDirective,
  LiveGuideUpdate,
  ScreenCaptureResult,
  EmbedBootstrapResponse,
} from './types.js';

