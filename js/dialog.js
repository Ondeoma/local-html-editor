// 入力ダイアログ. 表示は画面側(Scalactive の Dialogs コンポーネント)が window.__lhePrompt として用意する.

/** 文字列を入力してもらいます(キャンセルなら null). suggestions は入力候補 */
export function prompt(title, value = '', suggestions = []) {
  const p = window.__lhePrompt
  if (!p) return Promise.resolve(window.prompt(title, value))
  return p(title, value, suggestions)
}
