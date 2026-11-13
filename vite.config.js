import { defineConfig } from 'vite'
import scalaJSPlugin from '@scala-js/vite-plugin-scalajs'

export default defineConfig({
  plugins: [scalaJSPlugin()],
  clearScreen: false,
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/target/**', '**/src-tauri/gen/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
})
