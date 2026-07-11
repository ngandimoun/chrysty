export type FocusAnnotationShape = 'circle' | 'rect' | 'highlight' | 'arrow' | 'pointer';

export interface FocusAnnotation {
  id: string;
  shape: FocusAnnotationShape;
  x: number;
  y: number;
  width: number;
  height: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
}

export type LiveGuideDirectiveKind = 'pointer' | 'path' | 'region' | 'ghost';

export type LiveGuideEmphasis = 'primary' | 'secondary' | 'warning';

export interface VisualGuidancePoint {
  x: number;
  y: number;
}

export interface LiveGuideDirective {
  id: string;
  kind: LiveGuideDirectiveKind;
  points: VisualGuidancePoint[];
  label?: string;
  detail?: string;
  emphasis?: LiveGuideEmphasis;
  sequence?: number;
}

export interface LiveGuideUpdate {
  directives: LiveGuideDirective[];
  clearPrevious?: boolean;
  coachingNote?: string | null;
  spokenText?: string | null;
}

export interface HostUiContext {
  source?: string;
  entityId?: string;
  title: string;
  selectedPassage?: string;
  nearbyExcerpt?: string;
  artifactLanguage?: string;
  worker?: string;
}

export interface HostContextValue {
  context: HostUiContext;
  captureTarget?: string;
  getCaptureTargetRect: () => DOMRect | null;
}

export interface ScreenCaptureResult {
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  focusAnnotations?: FocusAnnotation[];
}

export interface LiveEmbedConfig {
  astraEmbedUrl: string;
  worker: string;
  mode?: 'iframe';
}

export interface EmbedBootstrapResponse {
  astraKey: string;
  userId: string | null;
  companionProfile?: Record<string, unknown>;
}

export const EMBED_MESSAGE = {
  EMBED_READY: 'chrysty:embed_ready',
  HOST_READY: 'chrysty:host_ready',
  CONTEXT_UPDATE: 'chrysty:context_update',
  CAPTURE_UPDATE: 'chrysty:capture_update',
  CONNECTED: 'chrysty:connected',
  SPEAKING: 'chrysty:speaking',
  LIVE_GUIDE: 'chrysty:live_guide',
  CLOSED: 'chrysty:closed',
} as const;

export type EmbedMessageType = (typeof EMBED_MESSAGE)[keyof typeof EMBED_MESSAGE];
