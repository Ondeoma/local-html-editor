import './style.css'

// Tauri の外で開いた開発サーバー(npm run dev:vite)では、仮のワークスペースで動かす
if (import.meta.env.DEV && !window.__TAURI_INTERNALS__) await import('./js/mock.js')
// Scala.js から使う JS の機能を先に用意してから、画面(Scala.js)を起動する
await import('./js/bridge.js')
await import('scalajs:main.js') // "@scala-js/vite-plugin-scalajs" が置き換える
