// Streams raw mono PCM chunks (128 samples/frame, whatever the AudioContext's
// sampleRate is) back to the main thread via the node's MessagePort. We take
// channel 0 only — this is a toy capturing one webview's audio, not a
// multichannel mixer.
//
// Deliberately plain JS, not TS: this file is loaded at runtime via fetch +
// Blob URL (see capture.ts), bypassing Vite/esbuild's compile step entirely,
// so any TypeScript syntax here would ship untranspiled and fail to parse.
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0].slice())
    }
    return true
  }
}

registerProcessor('recorder-processor', RecorderProcessor)
