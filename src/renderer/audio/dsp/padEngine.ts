export interface PadRegion {
  startSec: number
  endSec: number
}

// Minimal one-shot player for now — M4 will grow this into a full
// filter/envelope/gain graph per pad without changing this class's shape.
export class Pad {
  buffer: AudioBuffer | null = null
  region: PadRegion | null = null
  /** Absolute time (seconds) in the source video to seek to on trigger, for show. */
  videoSeekTime: number | null = null

  hasAudio(): boolean {
    return this.buffer !== null
  }

  durationLabel(): string {
    return this.buffer ? `${this.buffer.duration.toFixed(2)}s` : '--'
  }

  trigger(context: AudioContext): void {
    if (!this.buffer) return
    const source = context.createBufferSource()
    source.buffer = this.buffer
    source.connect(context.destination)
    source.start()
  }
}
