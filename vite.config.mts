import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electronSimple from 'vite-plugin-electron/simple'
import path from 'node:path'

const root = process.cwd()

export default defineConfig(async () => ({
  plugins: [
    react(),
    ...(await electronSimple({
      main: {
        entry: 'electron/main.ts',
        vite: { build: { outDir: 'dist-electron', minify: false, sourcemap: 'inline' } },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: { build: { outDir: 'dist-electron', minify: false, sourcemap: 'inline' } },
      },
    })),
  ],
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
      '@shared': path.join(root, 'shared'),
    },
  },
  // Electron 以 file:// 載入產物，必須用相對路徑
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
}))
