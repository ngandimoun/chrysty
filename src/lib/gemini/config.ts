export interface TranscriptionTimings {
  audioDurationMs: number;
  encodeMs: number;
  networkMs: number;
  apiMs: number;
  totalMs: number;
  /** Client-measured: stop recording → first streamed text delta. */
  timeToFirstTokenMs?: number | null;
  /** Server-measured: Gemini API call start → first text delta. */
  apiTimeToFirstTokenMs?: number | null;
}

export interface TranscriptionResult {
  transcript: string;
  timings: TranscriptionTimings;
}

export interface ResponseTimings {
  audioDurationMs: number;
  sttMs: number;
  llmMs: number;
  /** Combined multimodal STT + prompt generation (when using audio-in pipeline). */
  understandingMs?: number;
  ttsFirstAudioMs: number | null;
  ttsMs: number;
  totalMs: number;
  /** Client-measured: stop recording → first audio chunk played. */
  timeToFirstAudioMs?: number | null;
}

const GEMINI_SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/m4a',
  'audio/opus',
]);

const RAW_PCM_AUDIO_MIME_TYPES = new Set(['audio/l16', 'audio/s16le']);

const GEMINI_SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_GEMINI_TEACHER_MODEL = 'gemini-3.5-flash';
const DEFAULT_GEMINI_TEACHER_FALLBACK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
];

const MIME_ALIASES: Record<string, string> = {
  'audio/ogg;codecs=opus': 'audio/ogg',
  'audio/mp4': 'audio/m4a',
  'video/mp4': 'audio/m4a',
  'application/octet-stream': 'audio/m4a',
};

export function normalizeAudioMimeType(mimeType: string | null | undefined): string {
  const raw = (mimeType ?? '').trim().toLowerCase();
  if (!raw) return 'audio/wav';

  const base = raw.split(';')[0]?.trim() ?? raw;
  return MIME_ALIASES[raw] ?? MIME_ALIASES[base] ?? base;
}

export function isGeminiAcceptedMimeType(mimeType: string): boolean {
  return GEMINI_SUPPORTED_AUDIO_MIME_TYPES.has(normalizeAudioMimeType(mimeType));
}

export function isRawPcmMimeType(mimeType: string): boolean {
  return RAW_PCM_AUDIO_MIME_TYPES.has(normalizeAudioMimeType(mimeType));
}

export function normalizeImageMimeType(mimeType: string | null | undefined): string {
  const raw = (mimeType ?? '').trim().toLowerCase();
  if (!raw) return 'image/jpeg';
  return raw.split(';')[0]?.trim() ?? raw;
}

export function isGeminiAcceptedImageMimeType(mimeType: string): boolean {
  return GEMINI_SUPPORTED_IMAGE_MIME_TYPES.has(normalizeImageMimeType(mimeType));
}

export function isGeminiAcceptedReferencePdfMimeType(mimeType: string): boolean {
  return normalizeReferenceDocumentMimeType(mimeType) === 'application/pdf';
}

export function normalizeReferenceDocumentMimeType(mimeType: string | null | undefined): string {
  const raw = (mimeType ?? '').trim().toLowerCase();
  if (!raw) return '';
  return raw.split(';')[0]?.trim() ?? raw;
}

export function assertSupportedAudioMimeType(mimeType: string): void {
  if (!isGeminiAcceptedMimeType(mimeType)) {
    throw new Error(
      `Unsupported audio format: ${mimeType}. Browser recorded an unsupported format; client conversion may have failed.`,
    );
  }
}

export function assertSupportedImageMimeType(mimeType: string): void {
  if (!isGeminiAcceptedImageMimeType(mimeType)) {
    throw new Error(`Unsupported image format: ${mimeType}.`);
  }
}

export function getGeminiSttModel(): string {
  return process.env.GEMINI_STT_MODEL?.trim() || 'gemini-3.1-flash-lite';
}

export function getGeminiTeacherModel(): string {
  return (
    process.env.GEMINI_TEACHER_MODEL?.trim() ||
    process.env.GEMINI_RESPONSE_MODEL?.trim() ||
    DEFAULT_GEMINI_TEACHER_MODEL
  );
}

export function getGeminiResponseModel(): string {
  return getGeminiTeacherModel();
}

function parseModelList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

export function getGeminiTeacherFallbackModels(): string[] {
  const configured = parseModelList(
    process.env.GEMINI_TEACHER_FALLBACK_MODELS ?? process.env.GEMINI_RESPONSE_FALLBACK_MODELS,
  );
  return configured.length > 0 ? configured : DEFAULT_GEMINI_TEACHER_FALLBACK_MODELS;
}

export function getGeminiTeacherModelCandidates(primaryModel = getGeminiTeacherModel()): string[] {
  return Array.from(new Set([primaryModel, ...getGeminiTeacherFallbackModels()].filter(Boolean)));
}

export function getGeminiTeacherTimeoutMs(): number {
  const value = Number(process.env.GEMINI_TEACHER_TIMEOUT_MS ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 25000;
}

const DEFAULT_GEMINI_ROUTER_MODEL = 'gemini-3.1-flash-lite';

export function getGeminiRouterModel(): string {
  return process.env.GEMINI_ROUTER_MODEL?.trim() || DEFAULT_GEMINI_ROUTER_MODEL;
}

// The tool router is on the critical path before the main response model, so it defaults to
// the fast lite model. Teacher candidates are appended as fallbacks if the router model fails.
export function getGeminiRouterModelCandidates(): string[] {
  return Array.from(
    new Set([getGeminiRouterModel(), ...getGeminiTeacherModelCandidates()].filter(Boolean)),
  );
}

export function getGeminiRouterTimeoutMs(): number {
  const value = Number(process.env.GEMINI_ROUTER_TIMEOUT_MS ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 12000;
}

export function getGeminiTtsModel(): string {
  return process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-3.1-flash-tts-preview';
}

export function getGeminiTtsFallbackModel(): string {
  return process.env.GEMINI_TTS_FALLBACK_MODEL?.trim() || getGeminiTtsModel();
}

export function getGeminiTtsVoice(): string {
  return process.env.GEMINI_TTS_VOICE?.trim() || 'Aoede';
}

export function getGeminiTtsFallbackVoice(): string {
  return process.env.GEMINI_TTS_FALLBACK_VOICE?.trim() || getGeminiTtsVoice();
}

export function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return apiKey;
}

export function isGeminiGoogleSearchEnabled(): boolean {
  const raw = process.env.GEMINI_ENABLE_GOOGLE_SEARCH?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

export function isGeminiGoogleMapsEnabled(): boolean {
  const raw = process.env.GEMINI_ENABLE_GOOGLE_MAPS?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

export function isGeminiCodeExecutionEnabled(): boolean {
  const raw = process.env.GEMINI_ENABLE_CODE_EXECUTION?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

export function isGeminiUrlContextEnabled(): boolean {
  const raw = process.env.GEMINI_ENABLE_URL_CONTEXT?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

export function isGeminiCustomToolsEnabled(): boolean {
  const raw = process.env.GEMINI_ENABLE_CUSTOM_TOOLS?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

export function getOpenWeatherApiKey(): string | undefined {
  const key = process.env.OPENWEATHER_API_KEY?.trim();
  return key || undefined;
}
