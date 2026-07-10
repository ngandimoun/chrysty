const CAPTURE_SAMPLE_RATE = 16000;

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
function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) {
    return input;
  }
  const ratio = fromRate / toRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const current = input[index];
    const next = index + 1 < input.length ? input[index + 1] : current;
    output[i] = current + (next - current) * fraction;
  }
  return output;
}

export interface LivePcmCapture {
  stop: () => void;
}

export async function startLivePcmCapture(
  stream: MediaStream,
  onPcmChunk: (chunk: ArrayBuffer) => void,
): Promise<LivePcmCapture> {
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
  console.info('[live-capture] mic context sample rate', {
    requested: CAPTURE_SAMPLE_RATE,
    actual: actualRate,
    resampling: needsResample,
  });

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'pcm-recorder-processor');
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const samples = needsResample
      ? resampleLinear(event.data, actualRate, CAPTURE_SAMPLE_RATE)
      : event.data;
    onPcmChunk(float32ToPcm16(samples));
  };

  source.connect(node);

  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      void context.close();
    },
  };
}
