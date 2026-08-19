import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // @openbuff/sdk 與其 WASM 依賴在 main process 以 Node 原生方式載入，
        // 不打包進 bundle，避免 WASM 路徑解析問題。
        external: ['@openbuff/sdk']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': new URL('./src/renderer/src', import.meta.url).pathname
      }
    }
  }
})
