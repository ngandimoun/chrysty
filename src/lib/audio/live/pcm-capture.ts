const CAPTURE_SAMPLE_RATE = 16000;

function float32ToPcm16(input: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    pcm16[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
  }
  return pcm16.buffer;
}

export interface LivePcmCapture {
  stop: () => void;
}

export async function startLivePcmCapture(
  stream: MediaStream,
  onPcmChunk: (chunk: ArrayBuffer) => void,
): Promise<LivePcmCapture> {
  const context = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
  await context.audioWorklet.addModule('/audio/live/pcm-recorder-processor.js');

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'pcm-recorder-processor');
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    onPcmChunk(float32ToPcm16(event.data));
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
