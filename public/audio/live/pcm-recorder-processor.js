class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    if (inputs.length > 0 && inputs[0].length > 0) {
      const inputChannel = inputs[0][0];
      // Copy the buffer to avoid issues with recycled memory.
      const inputCopy = new Float32Array(inputChannel);
      this.port.postMessage(inputCopy);
    }
    return true;
  }
}

registerProcessor('pcm-recorder-processor', PCMProcessor);
