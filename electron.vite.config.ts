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
      rollupOptions: {
        input: { index: './src/renderer/index.html' }
      }
    }
  }
})
