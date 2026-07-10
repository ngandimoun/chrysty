import type { CompanionProfile } from '@/lib/gemini/companion-profile';
import type { ResponseTimings } from '@/lib/gemini/config';
import type { LiveGuideResponse } from '@/lib/gemini/voice-response-schema';
import type { UserContext } from '@/lib/gemini/user-context';
import type { ExplanationVisuals } from '@/lib/streaming/types';

export type LiveSessionMode = 'default' | 'live_guide';

export type LiveSessionPhase = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error';

export interface LiveGuideSessionState {
  task?: { name?: string; stage?: string; progress?: string };
  directives?: LiveGuideResponse['directives'];
  coaching_note?: string | null;
  watch_me_enabled?: boolean;
}

export interface LiveSessionStateRecord {
  session_id: string;
  workspace_id: string | null;
  astra_key: string;
  mode: LiveSessionMode;
  live_guide_state: LiveGuideSessionState | null;
  resumption_handle: string | null;
  pending_turn_id: string | null;
  updated_at: string;
}

export interface LiveHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface LiveSessionContextResponse {
  system_instruction: string;
  initial_history: LiveHistoryMessage[];
  session_state: LiveSessionStateRecord | null;
  voice_name: string;
  reconnect_note: string | null;
}

export interface LiveDelegateRequest {
  turn_id: string;
  session_id: string;
  transcript: string;
  user_intent?: string;
  visual_context?: string;
  mode?: LiveSessionMode;
  user_context?: UserContext;
  companion_profile?: CompanionProfile;
  images?: Array<{
    image_id?: string;
    mime_type: string;
    data_base64: string;
    width?: number;
    height?: number;
  }>;
}

export interface LiveDelegateAck {
  turn_id: string;
  status: 'processing';
  spoken_ack: string;
}

export type LiveDelegationStatus = 'queued' | 'running' | 'completed' | 'failed';
export type LiveDelegationStage =
  | 'queued'
  | 'analyzing'
  | 'using_search'
  | 'using_maps'
  | 'reading_source'
  | 'using_custom_tool'
  | 'running_code'
  | 'preparing_visuals'
  | 'completed'
  | 'failed';

export interface LiveDelegationResult {
  explanation_text: string;
  show_explanation: boolean;
  visuals: ExplanationVisuals;
  spoken_summary: string;
  timings: ResponseTimings;
  live_guide?: LiveGuideResponse | null;
  guidance_mode?: string;
}

export interface LiveDelegationRecord {
  turn_id: string;
  session_id: string;
  workspace_id: string;
  astra_key: string;
  user_id?: string;
  status: LiveDelegationStatus;
  request: LiveDelegateRequest;
  stage?: LiveDelegationStage | null;
  result?: LiveDelegationResult | null;
  spoken_summary?: string | null;
  error_message?: string | null;
  error_code?: string | null;
  error_stage?: LiveDelegationStage | null;
  created_at: string;
  updated_at: string;
}

/** Client-bound WebSocket protocol (Cloud Run → Astra PWA). */
export type LiveClientEvent =
  | {
      type: 'session_context_ready';
      session_id: string;
      mode: LiveSessionMode;
      pending_turn_id?: string | null;
    }
  | { type: 'connected'; session_id: string; mode: LiveSessionMode; pending_turn_id?: string | null }
  | { type: 'reconnecting' }
  | { type: 'audio'; data: string; sample_rate?: number }
  | { type: 'input_transcription'; text: string; finished: boolean }
  | { type: 'output_transcription'; text: string; finished: boolean }
  | { type: 'turn_complete' }
  | { type: 'interrupted' }
  | { type: 'delegation_started'; turn_id: string }
  | {
      type: 'delegation_status';
      turn_id: string;
      stage: LiveDelegationStage;
      error_code?: string;
    }
  | { type: 'simple_explanation'; text: string; turn_id?: string }
  | { type: 'live_guide_update'; live_guide: LiveGuideResponse | null; guidance_mode?: string }
  | { type: 'go_away'; resumption_handle?: string; time_left?: string }
  | { type: 'error'; message: string; fatal?: boolean };

export const DELEGATE_TO_STRUCTURED_LLM_TOOL = 'delegateToStructuredLLM';

export function createTurnId(): string {
  return `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createLiveSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `astra-${crypto.randomUUID()}`;
  }
  return `astra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const LIVE_SESSION_STORAGE_KEY = 'chrysty-astra-live-session-id';
export const LIVE_RESUMPTION_STORAGE_KEY = 'chrysty-astra-live-resumption-handle';
