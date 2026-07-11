import {
  getSharedAudioContext,
  setAudioSessionType,
} from '@/lib/audio/audio-context';
import { decodeBase64ToBytes } from '@/lib/audio/decode-base64';
import { isEmbeddedFrame } from '@/lib/audio/live/embed-frame';

const MODEL_SAMPLE_RATE = 24000;
/** Light duck in iframes only — full Live stays at 1.0. */
const EMBED_PLAYBACK_GAIN = 0.5;

function bytesToFloat32(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 2 !== 0) {
    throw new Error('Live PCM16 audio has an odd byte length.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768;
  }
  return samples;
}

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const outputLength = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const output = new Float32Array(outputLength);
  const scale = fromRate / toRate;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * scale;
    const left = Math.min(Math.floor(position), input.length - 1);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    output[index] = input[left] + (input[right] - input[left]) * fraction;
  }
  return output;
}

export interface LivePcmAudioChunk {
  data: string;
  sample_rate?: number;
}

export class LivePcmPlayer {
  private context: AudioContext | null = null;
  private ownsContext = false;
  private node: AudioWorkletNode | null = null;
  private outputGain: GainNode | null = null;
  private initializing: Promise<void> | null = null;
  private firstAudioFired = false;
  private onFirstAudio?: () => void;
  private onPlaybackEnd?: () => void;

  setOnFirstAudio(callback: (() => void) | undefined): void {
    this.onFirstAudio = callback;
  }

  setOnPlaybackEnd(callback: (() => void) | undefined): void {
    this.onPlaybackEnd = callback;
  }

  async initialize(): Promise<void> {
    if (this.node && this.context?.state !== 'closed') {
      if (this.context?.state === 'suspended') await this.context.resume();
      return;
    }
    if (this.initializing) return this.initializing;

    this.initializing = this.initializeInternal().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  private async initializeInternal(): Promise<void> {
    setAudioSessionType('play-and-record');

    const embedded = isEmbeddedFrame();
    let context: AudioContext;
    let ownsContext: boolean;

    if (embedded) {
      const shared = getSharedAudioContext();
      if (!shared) throw new Error('Web Audio API is not supported in this browser.');
      context = shared;
      ownsContext = false;
    } else {
      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio API is not supported in this browser.');
      try {
        context = new AudioContextCtor({ sampleRate: MODEL_SAMPLE_RATE });
      } catch {
        context = new AudioContextCtor();
      }
      ownsContext = true;
    }

    await context.audioWorklet.addModule('/audio/live/pcm-player-processor.js');
    const node = new AudioWorkletNode(context, 'live-pcm-player-processor', {
      outputChannelCount: [1],
    });
    node.port.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data.type === 'started' && !this.firstAudioFired) {
        this.firstAudioFired = true;
        this.onFirstAudio?.();
      } else if (event.data.type === 'drained') {
        this.firstAudioFired = false;
        this.onPlaybackEnd?.();
      }
    };
    const outputGain = context.createGain();
    outputGain.gain.value = embedded ? EMBED_PLAYBACK_GAIN : 1;
    node.connect(outputGain);
    outputGain.connect(context.destination);
    this.context = context;
    this.ownsContext = ownsContext;
    this.node = node;
    this.outputGain = outputGain;
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') {
      throw new Error(`Live playback context is ${context.state}.`);
    }
    console.info('[live-audio] player ready', {
      modelSampleRate: MODEL_SAMPLE_RATE,
      contextSampleRate: context.sampleRate,
      shared: !ownsContext,
      playbackGain: outputGain.gain.value,
    });
  }

  async enqueue(chunk: LivePcmAudioChunk): Promise<void> {
    await this.initialize();
    if (!this.node || !this.context) throw new Error('Live audio player is unavailable.');
    const bytes = decodeBase64ToBytes(chunk.data);
    const input = bytesToFloat32(bytes);
    const samples = resample(
      input,
      chunk.sample_rate ?? MODEL_SAMPLE_RATE,
      this.context.sampleRate,
    );
    this.node.port.postMessage({ samples }, [samples.buffer]);
  }

  finishTurn(): void {
    this.node?.port.postMessage({ command: 'endOfTurn' });
  }

  clear(): void {
    this.firstAudioFired = false;
    this.node?.port.postMessage({ command: 'clear' });
  }

  async close(): Promise<void> {
    this.clear();
    this.node?.disconnect();
    this.node = null;
    this.outputGain?.disconnect();
    this.outputGain = null;
    if (this.ownsContext && this.context && this.context.state !== 'closed') {
      await this.context.close();
    }
    this.context = null;
    this.ownsContext = false;
  }
}
