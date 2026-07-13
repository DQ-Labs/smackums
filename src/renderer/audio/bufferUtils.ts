export function sliceToAudioBuffer(
  context: AudioContext,
  source: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number
): AudioBuffer {
  const startIdx = Math.max(0, Math.floor(startSec * sampleRate))
  const endIdx = Math.min(source.length, Math.floor(endSec * sampleRate))
  const length = Math.max(1, endIdx - startIdx)

  const audioBuffer = context.createBuffer(1, length, sampleRate)
  audioBuffer.copyToChannel(new Float32Array(source.subarray(startIdx, startIdx + length)), 0)
  return audioBuffer
}
