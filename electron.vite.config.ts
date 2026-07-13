import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: './electron/main/index.ts' }
      }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: './electron/preload/index.ts' }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      // The recorder AudioWorklet script is small enough that Vite would
      // otherwise inline it as a data: URI — which our CSP (and the
      // Worklet module-script fetch) then refuses to load. Force every
      // ?url-imported asset to stay a real file instead.
      assetsInlineLimit: 0,
      rollupOptions: {
        input: { index: './src/renderer/index.html' }
      }
    }
  }
})
