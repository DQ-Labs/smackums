import workletUrl from './recorder-worklet?url'

export interface CaptureResult {
  buffer: Float32Array
  sampleRate: number
}

// Captures loopback audio of the app's own window (see the main process's
// setDisplayMediaRequestHandler) and accumulates it into a growable PCM
// buffer. This is whole-system audio, not scoped to just the webview — see
// the plan's note on why that's an acceptable v1 simplification.
export class CaptureSession {
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private workletNode: AudioWorkletNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private chunks: Float32Array[] = []
  private totalLength = 0
  private lastSampleRate = 48000

  async start(): Promise<void> {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    })

    displayStream.getVideoTracks().forEach((track) => track.stop())
    const audioTracks = displayStream.getAudioTracks()
    if (audioTracks.length === 0) {
      throw new Error('No audio track captured — is anything playing?')
    }
    this.stream = new MediaStream(audioTracks)

    this.audioContext = new AudioContext()
    this.lastSampleRate = this.audioContext.sampleRate
    await this.audioContext.audioWorklet.addModule(workletUrl)

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
    this.workletNode = new AudioWorkletNode(this.audioContext, 'recorder-processor')
    this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>): void => {
      this.chunks.push(event.data)
      this.totalLength += event.data.length
    }

    this.sourceNode.connect(this.workletNode)
  }

  /** Concatenated snapshot of everything captured so far, without stopping. */
  getSnapshot(): Float32Array {
    const buffer = new Float32Array(this.totalLength)
    let offset = 0
    for (const chunk of this.chunks) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }
    return buffer
  }

  stop(): CaptureResult {
    this.workletNode?.disconnect()
    this.sourceNode?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.audioContext?.close()

    const buffer = this.getSnapshot()
    const sampleRate = this.lastSampleRate

    this.chunks = []
    this.totalLength = 0
    this.audioContext = null
    this.stream = null
    this.workletNode = null
    this.sourceNode = null

    return { buffer, sampleRate }
  }
}
