import './style.css'
import type { WebviewTag } from 'electron'
import { CaptureSession, type CaptureResult } from './audio/capture'
import { WaveformView } from './audio/waveform'
import { PadGridView } from './ui/padGrid'
import { sliceToAudioBuffer } from './audio/bufferUtils'
import { MidiLearnManager } from './midi/midiLearn'

const webview = document.getElementById('ytview') as unknown as WebviewTag
const addressBar = document.getElementById('address-bar') as HTMLInputElement
const backBtn = document.getElementById('nav-back') as HTMLButtonElement
const forwardBtn = document.getElementById('nav-forward') as HTMLButtonElement
const reloadBtn = document.getElementById('nav-reload') as HTMLButtonElement
const captureBtn = document.getElementById('capture-btn') as HTMLButtonElement
const captureStatus = document.getElementById('capture-status') as HTMLElement
const canvas = document.getElementById('waveform-canvas') as HTMLCanvasElement
const padGridEl = document.getElementById('pad-grid') as HTMLElement
const midiLearnBtn = document.getElementById('midi-learn-btn') as HTMLButtonElement
const midiStatus = document.getElementById('midi-status') as HTMLElement

const waveform = new WaveformView(canvas)
const capture = new CaptureSession()
const playbackContext = new AudioContext()
const midi = new MidiLearnManager()

let capturing = false
let rafId = 0
let pendingVideoStartTime = 0
let lastCapture: (CaptureResult & { captureStartVideoTime: number }) | null = null
let learnModeActive = false
let armedPadIndex: number | null = null

function padTarget(index: number): string {
  return `pad-${index}`
}

function targetToIndex(target: string): number {
  return Number(target.replace('pad-', ''))
}

async function seekVideoTo(seconds: number): Promise<void> {
  try {
    await webview.executeJavaScript(
      `(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${seconds}; })()`
    )
  } catch {
    // webview may not have a <video> yet — fine, this is just for show.
  }
}

async function readVideoTime(): Promise<number> {
  try {
    return await webview.executeJavaScript(
      "(() => { const v = document.querySelector('video'); return v ? v.currentTime : 0; })()"
    )
  } catch {
    return 0
  }
}

function triggerPad(index: number): void {
  const pad = padGrid.pads[index]
  if (!pad.hasAudio()) return
  pad.trigger(playbackContext)
  padGrid.flash(index)
  if (pad.videoSeekTime !== null) void seekVideoTo(pad.videoSeekTime)
}

function assignPad(index: number): void {
  const region = waveform.getRegion()
  if (!region || !lastCapture) return

  const startSec = region.startSample / lastCapture.sampleRate
  const endSec = region.endSample / lastCapture.sampleRate
  const buffer = sliceToAudioBuffer(playbackContext, lastCapture.buffer, lastCapture.sampleRate, startSec, endSec)

  const pad = padGrid.pads[index]
  pad.buffer = buffer
  pad.region = { startSec, endSec }
  pad.videoSeekTime = lastCapture.captureStartVideoTime + startSec
  padGrid.refresh()
}

const padGrid = new PadGridView(padGridEl, (index, shiftKey) => {
  if (learnModeActive) {
    if (armedPadIndex !== null) padGrid.markLearning(armedPadIndex, false)
    armedPadIndex = index
    midi.armLearn(padTarget(index))
    padGrid.markLearning(index, true)
    return
  }
  if (shiftKey) {
    assignPad(index)
  } else {
    triggerPad(index)
  }
})

function clearArmedPad(): void {
  if (armedPadIndex !== null) {
    padGrid.markLearning(armedPadIndex, false)
    armedPadIndex = null
  }
}

midi.onStatusChange = (status) => {
  midiStatus.textContent = `MIDI: ${status}`
}
midi.onLearned = (target) => {
  clearArmedPad()
  void window.api.midi.save(midi.getMappings())
}
midi.onTrigger = (target) => {
  triggerPad(targetToIndex(target))
}

void (async () => {
  await midi.init()
  const saved = await window.api.midi.load()
  midi.loadMappings((saved as Record<string, { type: 'note' | 'cc'; channel: number; number: number }>) ?? {})
})()

midiLearnBtn.addEventListener('click', () => {
  learnModeActive = !learnModeActive
  midiLearnBtn.classList.toggle('active', learnModeActive)
  midiLearnBtn.textContent = learnModeActive ? 'Learning… click a pad' : 'MIDI Learn'
  if (!learnModeActive) {
    midi.cancelLearn()
    clearArmedPad()
  }
})

function normalizeUrl(input: string): string {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`
}

webview.addEventListener('did-navigate', () => {
  addressBar.value = webview.getURL()
})
webview.addEventListener('did-navigate-in-page', () => {
  addressBar.value = webview.getURL()
})

addressBar.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    webview.loadURL(normalizeUrl(addressBar.value))
  }
})

backBtn.addEventListener('click', () => webview.goBack())
forwardBtn.addEventListener('click', () => webview.goForward())
reloadBtn.addEventListener('click', () => webview.reload())

function renderLoop(): void {
  waveform.render(capture.getSnapshot())
  rafId = requestAnimationFrame(renderLoop)
}

captureBtn.addEventListener('click', async () => {
  if (!capturing) {
    try {
      pendingVideoStartTime = await readVideoTime()
      await capture.start()
      capturing = true
      captureBtn.classList.add('recording')
      captureBtn.textContent = '■ Stop'
      captureStatus.textContent = 'capturing…'
      renderLoop()
    } catch (err) {
      captureStatus.textContent = `error: ${(err as Error).message}`
    }
  } else {
    cancelAnimationFrame(rafId)
    const result = capture.stop()
    lastCapture = { ...result, captureStartVideoTime: pendingVideoStartTime }
    waveform.setBuffer(result.buffer)
    capturing = false
    captureBtn.classList.remove('recording')
    captureBtn.textContent = '● Capture'
    captureStatus.textContent = `captured ${(result.buffer.length / result.sampleRate).toFixed(1)}s — shift+click a pad to chop in the selection`
  }
})
