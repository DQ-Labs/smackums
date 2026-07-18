import { app, BrowserWindow, desktopCapturer, session, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'

function midiMappingsPath(): string {
  return join(app.getPath('userData'), 'midiMappings.json')
}

ipcMain.handle('midi:save', (_event, mappings) => {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(midiMappingsPath(), JSON.stringify(mappings, null, 2))
})

ipcMain.handle('midi:load', () => {
  const path = midiMappingsPath()
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8'))
})

// Session persistence: pad PCM and the last capture are raw little-endian
// float32 files next to a JSON manifest, so nothing audio-sized ever passes
// through JSON. The whole dir is replaced on save — no stale pad files.
function sessionDir(): string {
  return join(app.getPath('userData'), 'session')
}

interface SessionPadMeta {
  sampleRate: number
  region: { startSec: number; endSec: number } | null
  videoSeekTime: number | null
}

interface SessionMeta {
  sampleRate: number
  captureStartVideoTime: number
  hasCapture: boolean
  pads: (SessionPadMeta | null)[]
  seq?: {
    bpm: number
    swing: number
    bars: 1 | 2 | 4
    pattern: boolean[][]
  }
}

interface SessionPayload {
  meta: SessionMeta
  capture: Float32Array | null
  padPcm: (Float32Array | null)[]
}

function writeF32(path: string, data: Float32Array): void {
  writeFileSync(path, Buffer.from(data.buffer, data.byteOffset, data.byteLength))
}

function readF32(path: string): Float32Array {
  const buf = readFileSync(path)
  // slice() copies — a view straight onto the Buffer pool can be misaligned.
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

ipcMain.handle('session:save', (_event, payload: SessionPayload) => {
  const dir = sessionDir()
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.json'), JSON.stringify(payload.meta, null, 2))
  if (payload.capture) writeF32(join(dir, 'capture.f32'), payload.capture)
  payload.padPcm.forEach((pcm, i) => {
    if (pcm) writeF32(join(dir, `pad-${i}.f32`), pcm)
  })
})

ipcMain.handle('session:load', (): SessionPayload | null => {
  const dir = sessionDir()
  const metaPath = join(dir, 'session.json')
  if (!existsSync(metaPath)) return null
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as SessionMeta
    const capturePath = join(dir, 'capture.f32')
    const capture = meta.hasCapture && existsSync(capturePath) ? readF32(capturePath) : null
    const padPcm = meta.pads.map((pad, i) => {
      const path = join(dir, `pad-${i}.f32`)
      return pad && existsSync(path) ? readF32(path) : null
    })
    return { meta, capture, padPcm }
  } catch (err) {
    console.error('session load failed, starting fresh', err)
    return null
  }
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Auto-grant the renderer's getDisplayMedia() request with full-desktop
  // loopback audio, so we never show the OS source picker. Deliberately
  // screen-scoped rather than window-scoped: per-window audio loopback needs
  // the newer Windows Graphics Capture path (Win10 20348+/Win11, DWM
  // composition, compatible GPU driver) and fails outright with a bare
  // "Error starting capture" on machines that don't have it — whereas
  // full-desktop loopback is the older, far more broadly supported capture
  // path. capture.ts discards the video track immediately, so the video
  // source only needs to be valid, not scoped to this window — and the
  // audio was already effectively whole-system regardless (see capture.ts).
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        if (sources.length === 0) {
          console.error('desktopCapturer returned no screen sources')
          callback({})
          return
        }
        callback({ video: sources[0], audio: 'loopback' })
      })
      .catch((err) => {
        console.error('desktopCapturer.getSources failed', err)
        callback({})
      })
  })

  // This is a single-purpose personal toy (embeds only youtube.com), so
  // blanket-granting permission requests (midi, media, etc.) is fine — there's
  // no untrusted third-party content in play.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true))

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
