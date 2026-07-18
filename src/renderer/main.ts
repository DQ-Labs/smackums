import './style.css'
import type { WebviewTag } from 'electron'
import { CaptureSession, type CaptureResult } from './audio/capture'
import { WaveformView } from './audio/waveform'
import { PadGridView, PAD_KEYS } from './ui/padGrid'
import { sliceToAudioBuffer } from './audio/bufferUtils'
import { detectChops } from './audio/autoChop'
import { MidiLearnManager } from './midi/midiLearn'
import { Sequencer } from './audio/sequencer'
import { SeqGridView } from './ui/seqGrid'
import type { SessionPayload } from '../../electron/preload/index'

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
const keyDisplay = document.getElementById('key-display') as HTMLElement
const seqPane = document.getElementById('seq-pane') as HTMLElement
const seqBtn = document.getElementById('seq-btn') as HTMLButtonElement

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

// Auto-save the kit + capture shortly after any change, so closing the app
// never loses a session (the YPC lesson: a kit you can't reopen is a demo,
// not an instrument).
let saveTimer = 0
function scheduleSessionSave(): void {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    void saveSession().catch((err) => console.error('session save failed', err))
  }, 800)
}

async function saveSession(): Promise<void> {
  const payload: SessionPayload = {
    meta: {
      sampleRate: lastCapture?.sampleRate ?? playbackContext.sampleRate,
      captureStartVideoTime: lastCapture?.captureStartVideoTime ?? 0,
      hasCapture: lastCapture !== null,
      pads: padGrid.pads.map((pad) =>
        pad.buffer
          ? { sampleRate: pad.buffer.sampleRate, region: pad.region, videoSeekTime: pad.videoSeekTime }
          : null
      ),
      seq: {
        bpm: seq.state.bpm,
        swing: seq.state.swing,
        bars: seq.state.bars,
        pattern: seq.state.pattern.map((row) => [...row])
      }
    },
    capture: lastCapture?.buffer ?? null,
    padPcm: padGrid.pads.map((pad) => (pad.buffer ? pad.buffer.getChannelData(0) : null))
  }
  await window.api.session.save(payload)
}

async function restoreSession(): Promise<void> {
  const saved = await window.api.session.load()
  if (!saved) return

  if (saved.capture) {
    lastCapture = {
      buffer: saved.capture,
      sampleRate: saved.meta.sampleRate,
      captureStartVideoTime: saved.meta.captureStartVideoTime
    }
    waveform.setBuffer(saved.capture)
  }

  let restored = 0
  saved.meta.pads.forEach((padMeta, i) => {
    const pcm = saved.padPcm[i]
    if (!padMeta || !pcm || pcm.length === 0 || i >= padGrid.pads.length) return
    const buffer = playbackContext.createBuffer(1, pcm.length, padMeta.sampleRate)
    buffer.copyToChannel(pcm, 0)
    const pad = padGrid.pads[i]
    pad.buffer = buffer
    pad.region = padMeta.region
    pad.videoSeekTime = padMeta.videoSeekTime
    restored++
  })

  if (saved.meta.seq) {
    seq.loadState(saved.meta.seq)
    seqView.refresh()
  }

  if (restored > 0) {
    padGrid.refresh()
    captureStatus.textContent = `session restored — ${restored} pad${restored > 1 ? 's' : ''} loaded, play with Q W E R / A S D F`
  }
}

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
  keyDisplay.textContent = `${PAD_KEYS[index]} · pad ${index + 1}`
  seq.recordHit(index)
  if (pad.videoSeekTime !== null) void seekVideoTo(pad.videoSeekTime)
}

// Keyboard finger-drumming: QWER / ASDF mirror the two pad rows, space runs
// the sequencer transport. Skip when typing in an input (address bar) so
// navigation doesn't fire samples.
window.addEventListener('keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (event.key === ' ') {
    event.preventDefault()
    seq.toggle()
    return
  }
  const index = PAD_KEYS.indexOf(event.key.toUpperCase())
  if (index === -1) return
  event.preventDefault()
  triggerPad(index)
})

function loadPadFromCapture(index: number, startSec: number, endSec: number): void {
  if (!lastCapture) return
  const pad = padGrid.pads[index]
  pad.buffer = sliceToAudioBuffer(playbackContext, lastCapture.buffer, lastCapture.sampleRate, startSec, endSec)
  pad.region = { startSec, endSec }
  pad.videoSeekTime = lastCapture.captureStartVideoTime + startSec
}

function assignPad(index: number): void {
  const region = waveform.getRegion()
  if (!region || !lastCapture) return
  loadPadFromCapture(index, region.startSample / lastCapture.sampleRate, region.endSample / lastCapture.sampleRate)
  padGrid.refresh()
  scheduleSessionSave()
}

/** YPC-style instant gratification: every capture lands already playable. */
function autoChopCapture(): number {
  if (!lastCapture) return 0
  const chops = detectChops(lastCapture.buffer, lastCapture.sampleRate, padGrid.pads.length)
  chops.forEach((chop, i) => loadPadFromCapture(i, chop.startSec, chop.endSec))
  if (chops.length > 0) padGrid.refresh()
  return chops.length
}

const seq = new Sequencer(playbackContext, 8)

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

// Sequencer triggers bypass triggerPad: they're scheduled on the audio clock
// (no re-record, no video seeking mid-pattern), with the flash deferred to
// roughly when the sound lands.
seq.onTrigger = (index, when) => {
  const pad = padGrid.pads[index]
  if (!pad.hasAudio()) return
  pad.trigger(playbackContext, when)
  const delayMs = Math.max(0, (when - playbackContext.currentTime) * 1000)
  window.setTimeout(() => padGrid.flash(index), delayMs)
}
const seqView = new SeqGridView(seqPane, seq, (index) => triggerPad(index))
seq.onPlayhead = (step) => seqView.setPlayhead(step)

let seqRepaint = 0
seq.onChange = () => {
  scheduleSessionSave()
  // Live-recorded hits punch cells in from outside the UI — repaint soon,
  // but not once per hit during a roll.
  window.clearTimeout(seqRepaint)
  seqRepaint = window.setTimeout(() => seqView.refreshCells(), 100)
}

seqBtn.addEventListener('click', () => {
  const hidden = seqPane.classList.toggle('hidden')
  seqBtn.classList.toggle('active', !hidden)
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
  await restoreSession().catch((err) => console.error('session restore failed', err))
})()

midiLearnBtn.addEventListener('click', () => {
  learnModeActive = !learnModeActive
  midiLearnBtn.classList.toggle('active', learnModeActive)
  midiLearnBtn.textContent = learnModeActive ? 'Learning… click a pad below, then hit its MIDI control' : 'MIDI Learn'
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
      captureStatus.classList.remove('error')
      pendingVideoStartTime = await readVideoTime()
      await capture.start()
      capturing = true
      captureBtn.classList.add('recording')
      captureBtn.textContent = '■ Stop'
      captureStatus.textContent = 'capturing…'
      renderLoop()
    } catch (err) {
      console.error('capture failed to start', err)
      captureStatus.classList.add('error')
      captureStatus.textContent = `⚠ capture failed: ${(err as Error).message}`
    }
  } else {
    cancelAnimationFrame(rafId)
    const result = capture.stop()
    lastCapture = { ...result, captureStartVideoTime: pendingVideoStartTime }
    waveform.setBuffer(result.buffer)
    capturing = false
    captureBtn.classList.remove('recording')
    captureBtn.textContent = '● Capture'
    const chopped = autoChopCapture()
    scheduleSessionSave()
    const seconds = (result.buffer.length / result.sampleRate).toFixed(1)
    captureStatus.textContent =
      chopped > 0
        ? `captured ${seconds}s — auto-chopped ${chopped} pad${chopped > 1 ? 's' : ''}, play with Q W E R / A S D F (shift+click a pad to re-chop from the selection)`
        : `captured ${seconds}s — shift+click a pad to chop in the selection`
  }
})
