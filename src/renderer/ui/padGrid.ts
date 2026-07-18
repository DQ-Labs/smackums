import { Pad } from '../audio/dsp/padEngine'

export const PAD_COLORS = ['#c0392b', '#c9962b', '#b7b52b', '#4a9c4a', '#178a7a', '#2f6f9c', '#5b4a9c', '#9c3f7c']

// Two keyboard rows mirroring the 4x2 pad grid, so the physical key layout
// matches what's on screen (Q above A, like the pads they trigger).
export const PAD_KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F']

export class PadGridView {
  readonly pads: Pad[] = Array.from({ length: 8 }, () => new Pad())
  private elements: HTMLElement[] = []

  constructor(
    private container: HTMLElement,
    private onPadClick: (index: number, shiftKey: boolean) => void
  ) {
    this.render()
  }

  refresh(): void {
    this.render()
  }

  flash(index: number): void {
    const el = this.elements[index]
    if (!el) return
    el.classList.add('flash')
    window.setTimeout(() => el.classList.remove('flash'), 120)
  }

  markLearning(index: number, learning: boolean): void {
    const el = this.elements[index]
    if (!el) return
    el.classList.toggle('learning', learning)
  }

  private render(): void {
    this.container.innerHTML = ''
    this.elements = []
    this.pads.forEach((pad, i) => {
      const el = document.createElement('button')
      el.className = `pad ${pad.hasAudio() ? 'filled' : 'empty'}`
      el.style.setProperty('--pad-color', PAD_COLORS[i])
      el.title = 'Click: play (or learn MIDI, in learn mode) · Shift+Click: assign current selection'

      const key = document.createElement('span')
      key.className = 'pad-key'
      key.textContent = PAD_KEYS[i]

      const num = document.createElement('span')
      num.className = 'pad-num'
      num.textContent = String(i + 1)

      const dur = document.createElement('span')
      dur.className = 'pad-dur'
      dur.textContent = pad.durationLabel()

      el.append(key, num, dur)
      el.addEventListener('click', (event) => this.onPadClick(i, event.shiftKey))

      this.elements.push(el)
      this.container.appendChild(el)
    })
  }
}
