declare global {
  interface Navigator {
    audioSession?: {
      type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';
    };
  }
}

export {};

export type AudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record';

const SILENT_BUFFER_DURATION_SECONDS = 0.05;
const DEFAULT_UNLOCK_SESSION_TYPE: AudioSessionType = 'play-and-record';

let sharedContext: AudioContext | null = null;

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;

  if (!sharedContext || sharedContext.state === 'closed') {
    sharedContext = new AudioContextCtor();
  }

  return sharedContext;
}

export function getSharedAudioContextState(): AudioContextState | 'unavailable' {
  const ctx = getSharedAudioContext();
  return ctx?.state ?? 'unavailable';
}

export function setAudioSessionType(type: AudioSessionType): void {
  if (typeof navigator === 'undefined') return;

  try {
    if (navigator.audioSession) {
      navigator.audioSession.type = type;
      console.info('[audio] audioSession set to', type);
    }
  } catch (error) {
    console.warn('[audio] failed to set audioSession', { type, error });
  }
}

/** Mic + speaker during an active voice session. */
export function primeAudioForVoiceSession(): void {
  setAudioSessionType('play-and-record');
}

/** Replay-only paths where the mic is not needed. */
export function primeAudioForPlayback(): void {
  setAudioSessionType('playback');
}

export function resetAudioSession(): void {
  setAudioSessionType('auto');
}

function playSilentBuffer(ctx: AudioContext): void {
  const frameCount = Math.max(1, Math.ceil(ctx.sampleRate * SILENT_BUFFER_DURATION_SECONDS));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

/** Must run synchronously inside a user gesture (Record / connect tap). */
export function unlockSharedAudioContextSync(
  sessionType: AudioSessionType = DEFAULT_UNLOCK_SESSION_TYPE,
): AudioContext | null {
  const ctx = getSharedAudioContext();
  if (!ctx) {
    console.warn('[audio] unlock skipped: Web Audio API unavailable');
    return null;
  }

  setAudioSessionType(sessionType);

  const stateBefore = ctx.state;
  console.info('[audio] unlock start', { state: stateBefore, sessionType });

  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => {
        console.info('[audio] resume resolved', { state: ctx.state });
      })
      .catch((error) => {
        console.warn('[audio] resume failed', error);
      });
  }

  try {
    playSilentBuffer(ctx);
  } catch (error) {
    console.warn('[audio] silent buffer failed', error);
  }

  console.info('[audio] unlock end', { state: ctx.state, sessionType });
  return ctx;
}

export async function closeSharedAudioContext(): Promise<void> {
  if (!sharedContext) return;

  try {
    await sharedContext.close();
  } catch {
    // Context may already be closed.
  }

  sharedContext = null;
}
