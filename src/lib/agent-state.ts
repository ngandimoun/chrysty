import type { AgentState } from '@livekit/components-react';

import type { LiveSessionPhase } from '@/lib/live/types';
export type { LiveSessionPhase } from '@/lib/live/types';

export const LIVE_STATUS_LABELS: Record<LiveSessionPhase, string> = {
  idle: '',
  connecting: 'Connecting…',
  live: '',
  reconnecting: 'Reconnecting…',
  error: 'Something went wrong',
};

export type AppAgentPhase =
  | 'idle'
  | 'connecting'
  | 'reconnecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export function toAuraStateFromLive(phase: LiveSessionPhase, isModelSpeaking: boolean): AppAgentPhase {
  switch (phase) {
    case 'idle':
      return 'idle';
    case 'connecting':
      return 'connecting';
    case 'reconnecting':
      return 'reconnecting';
    case 'live':
      return isModelSpeaking ? 'speaking' : 'listening';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

export const STATUS_LABELS: Record<AppAgentPhase, string> = {
  idle: '',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Something went wrong',
};

export function toAuraState(phase: AppAgentPhase): AgentState {
  switch (phase) {
    case 'idle':
      return 'disconnected';
    case 'connecting':
    case 'reconnecting':
      return 'thinking';
    case 'listening':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'error':
      return 'failed';
    default:
      return 'disconnected';
  }
}

export const DEMO_CYCLE: AppAgentPhase[] = ['listening', 'thinking', 'speaking'];
