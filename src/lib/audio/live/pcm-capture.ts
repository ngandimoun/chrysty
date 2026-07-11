const CAPTURE_SAMPLE_RATE = 16000;
const CHUNK_SAMPLES = 320;
const DIAGNOSTIC_INTERVAL_MS = 2000;

function float32ToPcm16(input: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    pcm16[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
  }
  return pcm16.buffer;
}

/**
 * Linear-interpolation resampler. Browsers (notably iOS Safari) can ignore
 * the requested AudioContext sample rate; the live backend labels all
 * upstream audio as 16 kHz, so anything else must be resampled here or
 * Gemini hears sped-up gibberish.
 */
class StatefulLinearResampler {
  private buffered = new Float32Array(0);
  private position = 0;

  constructor(
    private readonly fromRate: number,
    private readonly toRate: number,
  ) {}

  process(input: Float32Array): Float32Array {
    if (this.fromRate === this.toRate || input.length === 0) return input;
    const combined = new Float32Array(this.buffered.length + input.length);
    combined.set(this.buffered);
    combined.set(input, this.buffered.length);

    const ratio = this.fromRate / this.toRate;
    const output: number[] = [];
    while (this.position + 1 < combined.length) {
      const left = Math.floor(this.position);
      const fraction = this.position - left;
      output.push(combined[left] + (combined[left + 1] - combined[left]) * fraction);
      this.position += ratio;
    }

    const consumed = Math.floor(this.position);
    this.buffered = combined.slice(consumed);
    this.position -= consumed;
    return Float32Array.from(output);
  }
}

export interface LivePcmCapture {
  stop: () => void;
  /** Disconnect mic graph and disable track (embed half-duplex during playback). */
  suspend: () => void;
  /** Re-enable mic graph after playback ends. */
  resume: () => void;
}

export async function startLivePcmCapture(
  stream: MediaStream,
  onPcmChunk: (chunk: ArrayBuffer) => void,
): Promise<LivePcmCapture> {
  const track = stream.getAudioTracks().find((candidate) => candidate.readyState === 'live');
  if (!track || !track.enabled) {
    throw new Error('Microphone track is not live.');
  }

  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
  } catch {
    // Some browsers throw when the requested rate is unsupported.
    context = new AudioContext();
  }
  await context.audioWorklet.addModule('/audio/live/pcm-recorder-processor.js');

  if (context.state === 'suspended') {
    await context.resume();
  }

  if (context.state === 'suspended') {
    throw new Error('Microphone audio context is suspended.');
  }

  const actualRate = context.sampleRate;
  const needsResample = actualRate !== CAPTURE_SAMPLE_RATE;
  const resampler = new StatefulLinearResampler(actualRate, CAPTURE_SAMPLE_RATE);
  let pendingSamples = new Float32Array(0);
  let diagnosticStartedAt = performance.now();
  let diagnosticSquareSum = 0;
  let diagnosticPeak = 0;
  let diagnosticSampleCount = 0;
  let emittedChunks = 0;
  console.info('[live-capture] mic context sample rate', {
    requested: CAPTURE_SAMPLE_RATE,
    actual: actualRate,
    resampling: needsResample,
  });

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'pcm-recorder-processor', {
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  const silentSink = context.createGain();
  silentSink.gain.value = 0;
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const samples = needsResample ? resampler.process(event.data) : event.data;
    if (samples.length === 0) return;

    const combined = new Float32Array(pendingSamples.length + samples.length);
    combined.set(pendingSamples);
    combined.set(samples, pendingSamples.length);
    let offset = 0;
    while (combined.length - offset >= CHUNK_SAMPLES) {
      const chunk = combined.slice(offset, offset + CHUNK_SAMPLES);
      for (const sample of chunk) {
        const magnitude = Math.abs(sample);
        diagnosticSquareSum += sample * sample;
        diagnosticPeak = Math.max(diagnosticPeak, magnitude);
      }
      diagnosticSampleCount += chunk.length;
      onPcmChunk(float32ToPcm16(chunk));
      emittedChunks += 1;
      offset += CHUNK_SAMPLES;
    }
    pendingSamples = combined.slice(offset);

    const now = performance.now();
    if (now - diagnosticStartedAt >= DIAGNOSTIC_INTERVAL_MS) {
      console.info('[live-capture] signal', {
        rms:
          diagnosticSampleCount > 0
            ? Math.sqrt(diagnosticSquareSum / diagnosticSampleCount).toFixed(4)
            : '0.0000',
        peak: diagnosticPeak.toFixed(4),
        emittedChunks,
        trackMuted: track.muted,
        trackReadyState: track.readyState,
      });
      diagnosticStartedAt = now;
      diagnosticSquareSum = 0;
      diagnosticPeak = 0;
      diagnosticSampleCount = 0;
    }
  };

  source.connect(node);
  node.connect(silentSink);
  silentSink.connect(context.destination);

  let suspended = false;
  let trackWasEnabled: boolean = track.enabled;

  return {
    suspend() {
      if (suspended) return;
      suspended = true;
      trackWasEnabled = track.enabled;
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
      track.enabled = false;
      pendingSamples = new Float32Array(0);
      console.info('[live-capture] suspended');
    },
    resume() {
      if (!suspended) return;
      suspended = false;
      track.enabled = trackWasEnabled;
      source.connect(node);
      console.info('[live-capture] resumed');
    },
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      silentSink.disconnect();
      void context.close();
    },
  };
}
