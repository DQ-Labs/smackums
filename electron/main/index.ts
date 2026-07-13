import { app, BrowserWindow, desktopCapturer, session, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

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

  // Auto-grant the renderer's getDisplayMedia() request against this app's
  // own window, so we never show the OS source picker — we always want
  // loopback audio of our own window's webview.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['window'] }).then((sources) => {
      const ownWindow = sources.find((s) => s.name === win.getTitle()) ?? sources[0]
      callback({ video: ownWindow, audio: 'loopback' })
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
