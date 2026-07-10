class LivePcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = Math.max(sampleRate * 30, 128);
    this.buffer = new Float32Array(this.capacity);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.bufferedFrames = 0;
    this.prebufferFrames = Math.max(Math.round(sampleRate * 0.12), 128);
    this.playing = false;
    this.turnEnded = false;
    this.drainNotified = false;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (message?.command === 'clear') {
        this.readIndex = this.writeIndex;
        this.bufferedFrames = 0;
        this.playing = false;
        this.turnEnded = false;
        this.drainNotified = false;
        return;
      }
      if (message?.command === 'endOfTurn') {
        this.turnEnded = true;
        if (this.bufferedFrames > 0 && !this.playing) {
          this.playing = true;
          this.port.postMessage({ type: 'started' });
        }
        return;
      }
      if (message?.samples instanceof Float32Array) {
        this.enqueue(message.samples);
      }
    };
  }

  enqueue(samples) {
    for (let index = 0; index < samples.length; index += 1) {
      if (this.bufferedFrames === this.capacity) {
        this.readIndex = (this.readIndex + 1) % this.capacity;
        this.bufferedFrames -= 1;
      }
      this.buffer[this.writeIndex] = samples[index];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
      this.bufferedFrames += 1;
    }
    this.drainNotified = false;
    if (!this.playing && this.bufferedFrames >= this.prebufferFrames) {
      this.playing = true;
      this.port.postMessage({ type: 'started' });
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const frames = output[0]?.length ?? 0;

    for (let frame = 0; frame < frames; frame += 1) {
      let value = 0;
      if (this.playing && this.bufferedFrames > 0) {
        value = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.capacity;
        this.bufferedFrames -= 1;
      }
      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel][frame] = value;
      }
    }

    if (this.playing && this.bufferedFrames === 0) {
      this.playing = false;
      if (this.turnEnded && !this.drainNotified) {
        this.drainNotified = true;
        this.turnEnded = false;
        this.port.postMessage({ type: 'drained' });
      }
    }
    return true;
  }
}

registerProcessor('live-pcm-player-processor', LivePcmPlayerProcessor);
