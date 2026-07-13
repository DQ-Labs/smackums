export type MidiTarget = string

export interface MidiMapping {
  type: 'note' | 'cc'
  channel: number
  number: number
}

export type MappingTable = Record<MidiTarget, MidiMapping>

// No hardcoded note/CC numbers for the MPK Mini 3 (or any controller) —
// mappings are learned live and persisted, since factory pad/knob layouts
// vary by bank and octave-shift state.
export class MidiLearnManager {
  private mappings: MappingTable = {}
  private access: MIDIAccess | null = null
  private learnTarget: MidiTarget | null = null

  onLearned: ((target: MidiTarget, mapping: MidiMapping) => void) | null = null
  onTrigger: ((target: MidiTarget, velocity: number) => void) | null = null
  onStatusChange: ((status: string) => void) | null = null

  async init(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      this.onStatusChange?.('not supported')
      return
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
    } catch {
      this.onStatusChange?.('access denied')
      return
    }
    this.attachInputs()
    this.access.onstatechange = (): void => this.attachInputs()
  }

  private attachInputs(): void {
    if (!this.access) return
    let count = 0
    this.access.inputs.forEach((input) => {
      input.onmidimessage = (event): void => this.handleMessage(event)
      count++
    })
    this.onStatusChange?.(count > 0 ? `${count} device${count > 1 ? 's' : ''}` : 'no devices')
  }

  private handleMessage(event: MIDIMessageEvent): void {
    const data = event.data
    if (!data || data.length < 2) return

    const statusByte = data[0]
    const channel = statusByte & 0x0f
    const command = statusByte & 0xf0
    const number = data[1]
    const value = data[2] ?? 0

    let mapping: MidiMapping
    if (command === 0x90 && value > 0) {
      mapping = { type: 'note', channel, number }
    } else if (command === 0xb0) {
      mapping = { type: 'cc', channel, number }
    } else {
      return // note-off and anything else is ignored for one-shot triggers
    }

    if (this.learnTarget) {
      this.mappings[this.learnTarget] = mapping
      this.onLearned?.(this.learnTarget, mapping)
      this.learnTarget = null
      return
    }

    const target = this.findTarget(mapping)
    if (target) this.onTrigger?.(target, value)
  }

  private findTarget(mapping: MidiMapping): MidiTarget | null {
    for (const [target, m] of Object.entries(this.mappings)) {
      if (m.type === mapping.type && m.number === mapping.number) return target
    }
    return null
  }

  armLearn(target: MidiTarget): void {
    this.learnTarget = target
  }

  cancelLearn(): void {
    this.learnTarget = null
  }

  getMappings(): MappingTable {
    return this.mappings
  }

  loadMappings(mappings: MappingTable): void {
    this.mappings = mappings ?? {}
  }
}
