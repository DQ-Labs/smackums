export type SeqBars = 1 | 2 | 4

export const STEPS_PER_BAR = 16
export const MAX_STEPS = 64

export interface SeqState {
  bpm: number
  swing: number
  bars: SeqBars
  /** [pad][step] — rows always hold MAX_STEPS so switching bars never loses data. */
  pattern: boolean[][]
}

// Classic lookahead scheduler: a coarse JS timer wakes often enough to keep a
// window of audio-clock-scheduled events ahead of the playhead, so triggering
// is sample-accurate even though setInterval isn't.
const LOOKAHEAD_SEC = 0.1
const TICK_MS = 25

export class Sequencer {
  readonly state: SeqState
  playing = false
  recording = false

  onTrigger: (padIndex: number, when: number) => void = () => {}
  onPlayhead: (step: number | null) => void = () => {}
  /** Fired on any pattern/parameter edit — hook persistence here. */
  onChange: () => void = () => {}
  onTransport: () => void = () => {}

  private timer = 0
  private nextStep = 0
  private nextStepTime = 0
  private generation = 0

  constructor(
    private context: AudioContext,
    padCount: number
  ) {
    this.state = {
      bpm: 90,
      swing: 50,
      bars: 1,
      pattern: Array.from({ length: padCount }, () => Array<boolean>(MAX_STEPS).fill(false))
    }
  }

  totalSteps(): number {
    return this.state.bars * STEPS_PER_BAR
  }

  private stepDur(): number {
    return 60 / this.state.bpm / 4
  }

  start(): void {
    if (this.playing) return
    void this.context.resume()
    this.playing = true
    this.nextStep = 0
    this.nextStepTime = this.context.currentTime + 0.05
    const gen = ++this.generation
    this.timer = window.setInterval(() => this.tick(gen), TICK_MS)
    this.onTransport()
  }

  stop(): void {
    if (!this.playing) return
    this.playing = false
    window.clearInterval(this.timer)
    this.generation++
    this.onPlayhead(null)
    this.onTransport()
  }

  toggle(): void {
    if (this.playing) {
      this.stop()
    } else {
      this.start()
    }
  }

  private tick(gen: number): void {
    while (this.nextStepTime < this.context.currentTime + LOOKAHEAD_SEC) {
      const step = this.nextStep
      let when = this.nextStepTime
      // MPC-style swing: every off-16th slides late within its pair.
      if (step % 2 === 1) when += ((this.state.swing - 50) / 100) * 2 * this.stepDur()

      this.state.pattern.forEach((row, padIndex) => {
        if (row[step]) this.onTrigger(padIndex, when)
      })

      const delayMs = Math.max(0, (when - this.context.currentTime) * 1000)
      window.setTimeout(() => {
        if (gen === this.generation) this.onPlayhead(step)
      }, delayMs)

      this.nextStep = (step + 1) % this.totalSteps()
      this.nextStepTime += this.stepDur()
    }
  }

  toggleStep(padIndex: number, step: number): void {
    const row = this.state.pattern[padIndex]
    if (!row || step >= MAX_STEPS) return
    row[step] = !row[step]
    this.onChange()
  }

  clear(): void {
    for (const row of this.state.pattern) row.fill(false)
    this.onChange()
  }

  /** Quantize a live hit to the nearest step and punch it into the grid. */
  recordHit(padIndex: number): void {
    if (!this.playing || !this.recording) return
    const row = this.state.pattern[padIndex]
    if (!row) return
    const position = this.nextStep - (this.nextStepTime - this.context.currentTime) / this.stepDur()
    const total = this.totalSteps()
    const step = ((Math.round(position) % total) + total) % total
    if (!row[step]) {
      row[step] = true
      this.onChange()
    }
  }

  setBpm(bpm: number): void {
    this.state.bpm = Math.min(300, Math.max(30, Math.round(bpm) || 90))
    this.onChange()
  }

  setSwing(swing: number): void {
    this.state.swing = Math.min(75, Math.max(50, Math.round(swing) || 50))
    this.onChange()
  }

  setBars(bars: SeqBars): void {
    this.state.bars = bars
    this.nextStep %= this.totalSteps()
    this.onChange()
  }

  /** Restore persisted state, defensively — a bad session file must not wedge playback. */
  loadState(saved: Partial<SeqState> | undefined): void {
    if (!saved) return
    if (typeof saved.bpm === 'number') this.setBpm(saved.bpm)
    if (typeof saved.swing === 'number') this.setSwing(saved.swing)
    if (saved.bars === 1 || saved.bars === 2 || saved.bars === 4) this.state.bars = saved.bars
    if (Array.isArray(saved.pattern)) {
      this.state.pattern.forEach((row, padIndex) => {
        const savedRow = saved.pattern?.[padIndex]
        if (!Array.isArray(savedRow)) return
        for (let s = 0; s < MAX_STEPS; s++) row[s] = savedRow[s] === true
      })
    }
  }
}
