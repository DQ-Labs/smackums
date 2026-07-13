import { contextBridge, ipcRenderer } from 'electron'

// Narrow bridge surface — expand as later milestones need main-process
// features (kit persistence, stem separation).
const api = {
  versions: process.versions,
  midi: {
    save: (mappings: unknown): Promise<void> => ipcRenderer.invoke('midi:save', mappings),
    load: (): Promise<unknown> => ipcRenderer.invoke('midi:load')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type SmackumsApi = typeof api
