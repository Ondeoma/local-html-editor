// CSS・JS のテキストエディタ(CodeMirror, シンタックスハイライト付き)
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { oneDark } from '@codemirror/theme-one-dark'

const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches

/** CodeMirror の表示文言(検索パネルなど)の日本語訳 */
const PHRASES = {
  'Find': '検索', 'Replace': '置換', 'next': '次へ', 'previous': '前へ', 'all': 'すべて',
  'match case': '大文字・小文字を区別', 'by word': '単語単位', 'regexp': '正規表現',
  'replace': '置換', 'replace all': 'すべて置換', 'close': '閉じる',
  'current match': '現在の一致', 'on line': '行', 'replaced match on line $': '$ 行目を置換しました', 'replaced $ matches': '$ 件を置換しました',
  'Go to line': '行へ移動', 'go': '移動',
  'Folded lines': '折りたたんだ行', 'Unfolded lines': '展開した行', 'to': '〜', 'folded code': '折りたたんだコード', 'unfold': '展開',
  'Fold line': '行を折りたたむ', 'Unfold line': '行を展開',
  'Control character': '制御文字', 'Completions': '補完候補', 'Diagnostics': '診断', 'No diagnostics': '診断はありません',
  'Selection deleted': '選択範囲を削除しました',
}

/**
 * @param opts.readOnly 読み取り専用
 * @param opts.text     初期の内容
 * @param opts.lang     'css' | 'js' | 'html'
 * @param opts.onChange (内容) => void
 */
export function createCodeEditor(el, opts) {
  let silent = false
  const view = new EditorView({
    parent: el,
    state: EditorState.create({
      doc: opts.text ?? '',
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        opts.lang === 'css' ? css() : opts.lang === 'html' ? html() : javascript(),
        EditorState.phrases.of(PHRASES),
        EditorState.readOnly.of(!!opts.readOnly),
        EditorView.editable.of(!opts.readOnly),
        ...(dark ? [oneDark] : []),
        EditorView.updateListener.of((u) => { if (u.docChanged && !silent) opts.onChange?.(u.state.doc.toString()) }),
        EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' } }),
      ],
    }),
  })
  return {
    /** 他の画面で保存された内容に差し替えます(変更通知は出さない) */
    setText: (text) => {
      if (text === view.state.doc.toString()) return
      silent = true
      try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }) } finally { silent = false }
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  }
}
