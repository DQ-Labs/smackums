import { contextBridge, ipcRenderer } from 'electron'

// Narrow bridge surface — expand as later milestones need main-process
// features (kit persistence, stem separation).
export interface SessionPadMeta {
  sampleRate: number
  region: { startSec: number; endSec: number } | null
  videoSeekTime: number | null
}

export interface SessionMeta {
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

export interface SessionPayload {
  meta: SessionMeta
  capture: Float32Array<ArrayBuffer> | null
  padPcm: (Float32Array<ArrayBuffer> | null)[]
}

const api = {
  versions: process.versions,
  midi: {
    save: (mappings: unknown): Promise<void> => ipcRenderer.invoke('midi:save', mappings),
    load: (): Promise<unknown> => ipcRenderer.invoke('midi:load')
  },
  session: {
    save: (payload: SessionPayload): Promise<void> => ipcRenderer.invoke('session:save', payload),
    load: (): Promise<SessionPayload | null> => ipcRenderer.invoke('session:load')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type SmackumsApi = typeof api
