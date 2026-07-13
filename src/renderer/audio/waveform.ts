export interface Region {
  startSample: number
  endSample: number
}

type DragMode = 'start' | 'end' | 'move' | null

export class WaveformView {
  private ctx: CanvasRenderingContext2D
  private buffer: Float32Array = new Float32Array(0)
  private region: Region | null = null
  private dragging: DragMode = null
  private dragOffset = 0

  onRegionChange: ((region: Region) => void) | null = null

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx

    canvas.addEventListener('mousedown', this.handleMouseDown)
    window.addEventListener('mousemove', this.handleMouseMove)
    window.addEventListener('mouseup', this.handleMouseUp)
  }

  private resize(): void {
    const { width, height } = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const targetW = Math.max(1, Math.round(width * dpr))
    const targetH = Math.max(1, Math.round(height * dpr))
    if (this.canvas.width !== targetW) this.canvas.width = targetW
    if (this.canvas.height !== targetH) this.canvas.height = targetH
  }

  private sampleAtClientX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const xPx = (clientX - rect.left) * dpr
    const samplesPerPixel = this.buffer.length / Math.max(1, this.canvas.width)
    return Math.max(0, Math.min(this.buffer.length, Math.round(xPx * samplesPerPixel)))
  }

  private handleMouseDown = (event: MouseEvent): void => {
    if (!this.region) return
    const s = this.sampleAtClientX(event.clientX)
    const samplesPerPixel = this.buffer.length / Math.max(1, this.canvas.width)
    const dpr = window.devicePixelRatio || 1
    const tolerance = samplesPerPixel * 8 * dpr

    if (Math.abs(s - this.region.startSample) < tolerance) {
      this.dragging = 'start'
    } else if (Math.abs(s - this.region.endSample) < tolerance) {
      this.dragging = 'end'
    } else if (s > this.region.startSample && s < this.region.endSample) {
      this.dragging = 'move'
      this.dragOffset = s - this.region.startSample
    }
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.dragging || !this.region) return
    const s = this.sampleAtClientX(event.clientX)

    if (this.dragging === 'start') {
      this.region.startSample = Math.min(s, this.region.endSample - 1)
    } else if (this.dragging === 'end') {
      this.region.endSample = Math.max(s, this.region.startSample + 1)
    } else {
      const length = this.region.endSample - this.region.startSample
      const newStart = Math.max(0, Math.min(this.buffer.length - length, s - this.dragOffset))
      this.region.startSample = newStart
      this.region.endSample = newStart + length
    }
    this.render(this.buffer)
  }

  private handleMouseUp = (): void => {
    if (this.dragging && this.region) {
      this.onRegionChange?.(this.region)
    }
    this.dragging = null
  }

  /** Set a new capture buffer and (re)initialize a default chop region. */
  setBuffer(buffer: Float32Array): void {
    this.buffer = buffer
    if (buffer.length > 0) {
      this.region = { startSample: 0, endSample: Math.floor(buffer.length * 0.25) }
    } else {
      this.region = null
    }
    this.render(buffer)
    if (this.region) this.onRegionChange?.(this.region)
  }

  getRegion(): Region | null {
    return this.region
  }

  render(buffer: Float32Array): void {
    this.buffer = buffer
    this.resize()
    const { width, height } = this.canvas
    const ctx = this.ctx

    ctx.fillStyle = '#0d0d10'
    ctx.fillRect(0, 0, width, height)
    if (buffer.length === 0) return

    const mid = height / 2
    const samplesPerPixel = Math.max(1, Math.floor(buffer.length / width))
    ctx.fillStyle = '#4fd1c5'

    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel
      const end = Math.min(buffer.length, start + samplesPerPixel)
      let min = 1
      let max = -1
      for (let i = start; i < end; i++) {
        const v = buffer[i]
        if (v < min) min = v
        if (v > max) max = v
      }
      if (min > max) {
        min = 0
        max = 0
      }
      const y1 = mid + min * mid
      const y2 = mid + max * mid
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
    }

    if (this.region) {
      const toX = (s: number): number => (s / buffer.length) * width
      const x1 = toX(this.region.startSample)
      const x2 = toX(this.region.endSample)
      ctx.fillStyle = 'rgba(79, 209, 197, 0.15)'
      ctx.fillRect(x1, 0, x2 - x1, height)
      ctx.fillStyle = '#e6e6e9'
      ctx.fillRect(x1 - 1, 0, 2, height)
      ctx.fillRect(x2 - 1, 0, 2, height)
    }
  }
}
