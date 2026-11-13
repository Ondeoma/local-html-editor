// Tauri(Rust側)の機能の呼び出しと、ワークスペースのファイルのURL.
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export { invoke }

const isWindows = navigator.userAgent.includes('Windows')

/**
 * ワークスペースのファイルを表示するためのURL(Rust側の lhe プロトコルが返す).
 * パスはワークスペースからの相対パス. ディレクトリの場合は末尾に / を付けて渡す.
 */
export function fileUrl(rel) {
  const path = rel.split('/').map(encodeURIComponent).join('/')
  return (isWindows ? 'http://lhe.localhost/' : 'lhe://localhost/') + path
}

/** スキームや / で始まらない、相対パスのURLか */
export function isRelativeUrl(v) {
  return !!v && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(v)
}

/** ディレクトリを選ぶダイアログ(キャンセルなら null) */
export async function pickDirectory() {
  const r = await open({ directory: true, multiple: false, title: 'ワークスペースを選択' })
  return typeof r === 'string' ? r : null
}

/** ファイルを <HTML名>_IMG に保存し、HTMLからの相対パスを返します */
export async function uploadAsset(htmlPath, file) {
  const data = new Uint8Array(await file.arrayBuffer())
  return invoke('save_asset', data, {
    headers: { 'x-html-path': encodeURIComponent(htmlPath), 'x-file-name': encodeURIComponent(file.name) },
  })
}

/** ファイル選択(キャンセルなら空配列) */
export function pickFiles(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (accept) input.accept = accept
    input.addEventListener('change', () => resolve([...(input.files ?? [])]))
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}
