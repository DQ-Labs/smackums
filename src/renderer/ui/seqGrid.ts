import { Sequencer, type SeqBars } from '../audio/sequencer'
import { PAD_COLORS, PAD_KEYS } from './padGrid'

export class SeqGridView {
  private playBtn: HTMLButtonElement
  private recBtn: HTMLButtonElement
  private bpmInput: HTMLInputElement
  private swingInput: HTMLInputElement
  private barsSelect: HTMLSelectElement
  private gridEl: HTMLElement
  private cells: HTMLButtonElement[][] = []
  private playheadStep: number | null = null

  constructor(
    container: HTMLElement,
    private seq: Sequencer,
    onAudition: (padIndex: number) => void
  ) {
    const transport = document.createElement('div')
    transport.className = 'seq-transport'

    this.playBtn = document.createElement('button')
    this.playBtn.addEventListener('click', () => this.seq.toggle())

    this.recBtn = document.createElement('button')
    this.recBtn.textContent = '● Rec'
    this.recBtn.title = 'Record pad hits into the grid while playing'
    this.recBtn.addEventListener('click', () => {
      this.seq.recording = !this.seq.recording
      this.recBtn.classList.toggle('active', this.seq.recording)
    })

    this.bpmInput = this.numberInput(30, 300, this.seq.state.bpm)
    this.bpmInput.addEventListener('change', () => {
      this.seq.setBpm(Number(this.bpmInput.value))
      this.bpmInput.value = String(this.seq.state.bpm)
    })

    this.swingInput = this.numberInput(50, 75, this.seq.state.swing)
    this.swingInput.addEventListener('change', () => {
      this.seq.setSwing(Number(this.swingInput.value))
      this.swingInput.value = String(this.seq.state.swing)
    })

    this.barsSelect = document.createElement('select')
    for (const bars of [1, 2, 4]) {
      const option = document.createElement('option')
      option.value = String(bars)
      option.textContent = `${bars} bar${bars > 1 ? 's' : ''}`
      this.barsSelect.appendChild(option)
    }
    this.barsSelect.addEventListener('change', () => {
      this.seq.setBars(Number(this.barsSelect.value) as SeqBars)
      this.rebuildGrid()
    })

    const clearBtn = document.createElement('button')
    clearBtn.textContent = 'Clear'
    clearBtn.addEventListener('click', () => {
      this.seq.clear()
      this.refreshCells()
    })

    transport.append(
      this.playBtn,
      this.recBtn,
      this.labeled('BPM', this.bpmInput),
      this.labeled('Swing', this.swingInput),
      this.labeled('Bars', this.barsSelect),
      clearBtn
    )

    this.gridEl = document.createElement('div')
    this.gridEl.className = 'seq-grid'

    container.append(transport, this.gridEl)

    this.onAudition = onAudition
    this.seq.onTransport = () => this.syncTransport()
    this.syncTransport()
    this.rebuildGrid()
  }

  private onAudition: (padIndex: number) => void

  private labeled(text: string, control: HTMLElement): HTMLElement {
    const label = document.createElement('label')
    label.className = 'seq-label'
    const span = document.createElement('span')
    span.textContent = text
    label.append(span, control)
    return label
  }

  private numberInput(min: number, max: number, value: number): HTMLInputElement {
    const input = document.createElement('input')
    input.type = 'number'
    input.min = String(min)
    input.max = String(max)
    input.value = String(value)
    return input
  }

  syncTransport(): void {
    this.playBtn.textContent = this.seq.playing ? '■ Stop' : '▶ Play'
    this.playBtn.classList.toggle('active', this.seq.playing)
  }

  /** Re-sync every control and cell from sequencer state (e.g. after session restore). */
  refresh(): void {
    this.bpmInput.value = String(this.seq.state.bpm)
    this.swingInput.value = String(this.seq.state.swing)
    this.barsSelect.value = String(this.seq.state.bars)
    this.syncTransport()
    this.rebuildGrid()
  }

  private rebuildGrid(): void {
    const steps = this.seq.totalSteps()
    this.gridEl.innerHTML = ''
    this.cells = []
    this.gridEl.style.setProperty('--steps', String(steps))

    this.seq.state.pattern.forEach((row, padIndex) => {
      const rowEl = document.createElement('div')
      rowEl.className = 'seq-row'
      rowEl.style.setProperty('--pad-color', PAD_COLORS[padIndex])

      const label = document.createElement('button')
      label.className = 'seq-row-label'
      label.textContent = `${padIndex + 1} · ${PAD_KEYS[padIndex]}`
      label.title = `Audition pad ${padIndex + 1}`
      label.addEventListener('click', () => this.onAudition(padIndex))
      rowEl.appendChild(label)

      const rowCells: HTMLButtonElement[] = []
      for (let step = 0; step < steps; step++) {
        const cell = document.createElement('button')
        cell.className = 'seq-cell'
        cell.setAttribute('aria-label', `Pad ${padIndex + 1}, step ${step + 1}`)
        if (step % 4 === 0) cell.classList.add('beat')
        if (row[step]) cell.classList.add('on')
        cell.addEventListener('click', () => {
          this.seq.toggleStep(padIndex, step)
          cell.classList.toggle('on', row[step])
        })
        rowCells.push(cell)
        rowEl.appendChild(cell)
      }
      this.cells.push(rowCells)
      this.gridEl.appendChild(rowEl)
    })
  }

  /** Repaint on-states without rebuilding DOM (live record punches cells in). */
  refreshCells(): void {
    this.seq.state.pattern.forEach((row, padIndex) => {
      this.cells[padIndex]?.forEach((cell, step) => cell.classList.toggle('on', row[step]))
    })
  }

  setPlayhead(step: number | null): void {
    if (this.playheadStep !== null) {
      for (const rowCells of this.cells) rowCells[this.playheadStep]?.classList.remove('playhead')
    }
    this.playheadStep = step
    if (step !== null) {
      for (const rowCells of this.cells) rowCells[step]?.classList.add('playhead')
    }
  }
}
