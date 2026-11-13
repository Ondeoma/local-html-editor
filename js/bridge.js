// Scala.js(Scalactive)の画面から使うJSの機能を window.__lhe にまとめます.
// main.js で Scala.js より先に読み込むこと.
window.LHE_EDITOR = true // lhe.js にエディタ内であることを伝える(自動で描画しない)
import '../src-tauri/assets/lhe.js'
import mermaid from 'mermaid'
import { invoke, fileUrl, pickDirectory } from './host.js'
import { createWysiwyg, PANEL_PRESETS } from './wysiwyg.js'
import { createCodeEditor } from './code.js'

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
window.mermaid = mermaid
window.LHE.injectCss(document)

// ファイルを編集領域の外に落としたとき、画面がそのファイルの表示に切り替わってしまうのを防ぐ
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

// ブラウザ標準の右クリックメニュー(「Open Frame in New Window」など)は出さない.
// 文字を入力する場所(エディタ・入力欄)では、コピー・貼り付けのため標準のメニューを残す
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest?.('input, textarea, [contenteditable="true"], .cm-content')) e.preventDefault()
})

window.__lhe = { invoke, fileUrl, pickDirectory, createWysiwyg, createCodeEditor, panelPresets: PANEL_PRESETS }
