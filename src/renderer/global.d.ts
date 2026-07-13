import type { SmackumsApi } from '../../electron/preload/index'

declare global {
  interface Window {
    api: SmackumsApi
  }
}

export {}
