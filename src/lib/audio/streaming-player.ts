import {
  getSharedAudioContext,
  getSharedAudioContextState,
  unlockSharedAudioContextSync,
} from '@/lib/audio/audio-context';
import { decodeBase64ToBytes } from '@/lib/audio/decode-base64';

const SAMPLE_RATE = 24000;
const SCHEDULE_LEAD_SECONDS = 0.05;
const START_BUFFER_SECONDS = 0.4;
const BUFFER_GROWTH_SECONDS = 0.6;
const MAX_BUFFER_SECONDS = 5;

export async function prewarmAudioContext(): Promise<void> {
  unlockSharedAudioContextSync();
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return new Uint8Array(b);
  if (b.length === 0) return new Uint8Array(a);
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

function bytesToFloat32(bytes: Uint8Array): Float32Array {
  const copy = new Uint8Array(bytes);
  const int16 = new Int16Array(copy.buffer, 0, copy.byteLength / 2);
  const float32 = new Float32Array(int16.length);

  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }

  return float32;
}

export interface StreamingAudioChunk {
  data: string;
  mime_type?: string;
  sample_rate?: number;
}

/** Schedules streamed PCM chunks onto one AudioContext timeline. */
export class StreamingAudioPlayer {
  private scheduledSources: AudioBufferSourceNode[] = [];
  private chain: Promise<void> = Promise.resolve();
  private pcmRemainder = new Uint8Array(0);
  private accumulatedPcm = new Uint8Array(0);
  private nextPlayTime: number | null = null;
  private sampleRate = SAMPLE_RATE;
  private firstAudioFired = false;
  private onFirstAudio?: () => void;
  private onPlaybackEnd?: () => void;
  private activeSourceCount = 0;
  private inputEnded = true;
  private playbackStarted = false;
  private rebuffering = false;
  private bufferTargetSeconds = START_BUFFER_SECONDS;

  setOnFirstAudio(callback: (() => void) | undefined): void {
    this.onFirstAudio = callback;
  }

  setOnPlaybackEnd(callback: (() => void) | undefined): void {
    this.onPlaybackEnd = callback;
  }

  getState(): AudioContextState | 'unavailable' {
    return getSharedAudioContextState();
  }

  hasStartedPlayback(): boolean {
    return this.firstAudioFired;
  }

  private async ensureContext(): Promise<AudioContext> {
    const ctx = getSharedAudioContext();
    if (!ctx) {
      throw new Error('Web Audio API is not supported in this browser.');
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (ctx.state === 'suspended') {
      console.warn('[audio] context still suspended after resume', {
        state: ctx.state,
      });
    }

    return ctx;
  }

  private appendAlignedPcm(bytes: Uint8Array): Uint8Array {
    const combined = concatBytes(this.pcmRemainder, bytes);
    const alignedLength = combined.length - (combined.length % 2);

    this.pcmRemainder = new Uint8Array(combined.slice(alignedLength));
    return combined.slice(0, alignedLength);
  }

  private pcmToAudioBuffer(ctx: AudioContext, bytes: Uint8Array, sampleRate: number): AudioBuffer {
    const float32 = bytesToFloat32(bytes);
    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(new Float32Array(float32), 0);
    return buffer;
  }

  private bufferedSeconds(): number {
    return this.accumulatedPcm.length / 2 / this.sampleRate;
  }

  private schedulePendingPcm(ctx: AudioContext, force = false): void {
    if (this.accumulatedPcm.length < 2) {
      return;
    }

    if (!force) {
      const leadSeconds = this.nextPlayTime === null ? 0 : this.nextPlayTime - ctx.currentTime;

      if (!this.playbackStarted) {
        if (this.bufferedSeconds() < this.bufferTargetSeconds) {
          return;
        }
      } else if (leadSeconds <= 0) {
        if (!this.rebuffering) {
          this.rebuffering = true;
          this.bufferTargetSeconds = Math.min(
            MAX_BUFFER_SECONDS,
            this.bufferTargetSeconds + BUFFER_GROWTH_SECONDS,
          );
        }

        if (this.bufferedSeconds() < this.bufferTargetSeconds) {
          return;
        }
      }
    }

    const pending = this.accumulatedPcm;
    this.accumulatedPcm = new Uint8Array(0);
    const buffer = this.pcmToAudioBuffer(ctx, pending, this.sampleRate);
    this.playbackStarted = true;
    this.rebuffering = false;
    this.scheduleBuffer(ctx, buffer);
  }

  private scheduleBuffer(ctx: AudioContext, buffer: AudioBuffer): void {
    const now = ctx.currentTime;
    if (this.nextPlayTime === null || this.nextPlayTime < now) {
      this.nextPlayTime = now + SCHEDULE_LEAD_SECONDS;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;

    this.activeSourceCount += 1;
    this.scheduledSources.push(source);

    source.onended = () => {
      this.activeSourceCount -= 1;
      this.scheduledSources = this.scheduledSources.filter((scheduled) => scheduled !== source);
      if (this.activeSourceCount === 0 && this.inputEnded) {
        this.onPlaybackEnd?.();
      }
    };

    if (!this.firstAudioFired) {
      this.firstAudioFired = true;
      console.info('[audio] first audio scheduled', { state: ctx.state });
      this.onFirstAudio?.();
    }
  }

  private async enqueueInternal(chunk: StreamingAudioChunk): Promise<void> {
    this.inputEnded = false;
    const bytes = decodeBase64ToBytes(chunk.data);
    this.sampleRate = chunk.sample_rate ?? SAMPLE_RATE;

    const aligned = this.appendAlignedPcm(bytes);
    if (aligned.length > 0) {
      this.accumulatedPcm = new Uint8Array(concatBytes(this.accumulatedPcm, aligned));
    }

    const ctx = await this.ensureContext();
    if (ctx.state === 'suspended') {
      console.warn('[audio] enqueue while context suspended', {
        state: ctx.state,
        bufferedSeconds: this.bufferedSeconds(),
      });
    }
    this.schedulePendingPcm(ctx);
  }

  private async enqueuePcmInternal(pcm: Uint8Array, sampleRate: number): Promise<void> {
    this.inputEnded = false;
    this.sampleRate = sampleRate;

    const aligned = this.appendAlignedPcm(pcm);
    if (aligned.length > 0) {
      this.accumulatedPcm = new Uint8Array(concatBytes(this.accumulatedPcm, aligned));
    }

    const ctx = await this.ensureContext();
    this.schedulePendingPcm(ctx);
  }

  enqueue(chunk: StreamingAudioChunk): Promise<void> {
    this.chain = this.chain.then(() => this.enqueueInternal(chunk));
    return this.chain;
  }

  replayPcm(pcm: Uint8Array, sampleRate: number): Promise<void> {
    this.stop();
    this.chain = Promise.resolve()
      .then(() => this.enqueuePcmInternal(pcm, sampleRate))
      .then(() => this.flush());
    return this.chain;
  }

  flush(): Promise<void> {
    this.chain = this.chain.then(async () => {
      const ctx = await this.ensureContext();
      this.inputEnded = true;
      this.schedulePendingPcm(ctx, true);

      if (this.activeSourceCount === 0 && this.firstAudioFired) {
        this.onPlaybackEnd?.();
      }
    });

    return this.chain;
  }

  unlock(): Promise<void> {
    unlockSharedAudioContextSync('play-and-record');
    return this.ensureContext().then(() => undefined);
  }

  stop(): void {
    for (const source of this.scheduledSources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // Source may already be stopped.
      }
    }

    this.scheduledSources = [];
    this.chain = Promise.resolve();
    this.pcmRemainder = new Uint8Array(0);
    this.accumulatedPcm = new Uint8Array(0);
    this.nextPlayTime = null;
    this.sampleRate = SAMPLE_RATE;
    this.firstAudioFired = false;
    this.activeSourceCount = 0;
    this.inputEnded = true;
    this.playbackStarted = false;
    this.rebuffering = false;
    this.bufferTargetSeconds = START_BUFFER_SECONDS;
  }

  async close(): Promise<void> {
    this.stop();
  }
}
