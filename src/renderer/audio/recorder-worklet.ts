/// <reference path="./audio-worklet-globals.d.ts" />

// Streams raw mono PCM chunks (128 samples/frame, whatever the AudioContext's
// sampleRate is) back to the main thread via the node's MessagePort. We take
// channel 0 only — this is a toy capturing one webview's audio, not a
// multichannel mixer.
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0].slice())
    }
    return true
  }
}

registerProcessor('recorder-processor', RecorderProcessor)
