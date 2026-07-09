class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    if (inputs.length > 0 && inputs[0].length > 0) {
      const inputChannel = inputs[0][0];
      this.port.postMessage(new Float32Array(inputChannel));
    }
    return true;
  }
}

registerProcessor('pcm-recorder-processor', PCMProcessor);
