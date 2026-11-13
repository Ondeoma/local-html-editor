// エディタの中に出すメニュー: 「/」で呼び出す挿入メニューと、画像・表を選んだときに近くに出るメニュー.
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import BubbleMenu from '@tiptap/extension-bubble-menu'

/** 「/」メニューの項目. cmd・arg は wysiwyg.js の commands に渡す */
export function slashItems(panels) {
  return [
    { label: '本文', icon: '¶', keys: 'text paragraph p honbun ほんぶん だんらく', cmd: 'heading', arg: 0 },
    { label: '見出し1', icon: 'H1', keys: 'h1 heading midashi みだし', cmd: 'heading', arg: 1 },
    { label: '見出し2', icon: 'H2', keys: 'h2 heading midashi みだし', cmd: 'heading', arg: 2 },
    { label: '見出し3', icon: 'H3', keys: 'h3 heading midashi みだし', cmd: 'heading', arg: 3 },
    { label: '見出し4', icon: 'H4', keys: 'h4 heading midashi みだし', cmd: 'heading', arg: 4 },
    { label: '箇条書き', icon: '•', keys: 'bullet list ul risuto kajougaki りすと かじょうがき', cmd: 'bulletList' },
    { label: '番号付きリスト', icon: '1.', keys: 'number ordered list ol risuto bangou りすと ばんごう', cmd: 'orderedList' },
    { label: '引用', icon: '❝', keys: 'quote blockquote inyou いんよう', cmd: 'blockquote' },
    { label: 'コードブロック', icon: '{ }', keys: 'code pre ko-do こーど', cmd: 'codeBlock' },
    { label: '水平線', icon: '―', keys: 'hr line divider suiheisen kugiri すいへいせん くぎり', cmd: 'hr' },
    { label: '表', icon: '▦', keys: 'table hyou hyo te-buru ひょう てーぶる', cmd: 'table' },
    { label: '画像', icon: '🖼', keys: 'image img picture gazou がぞう', cmd: 'image' },
    { label: '動画', icon: '🎬', keys: 'video movie douga どうが', cmd: 'video' },
    { label: 'ファイル', icon: '📎', keys: 'file attach fairu tenpu ふぁいる てんぷ', cmd: 'file' },
    { label: 'ページの埋め込み', icon: '⧉', keys: 'embed iframe page umekomi pe-ji うめこみ ぺーじ', cmd: 'embed' },
    { label: 'リンク', icon: '🔗', keys: 'link url rinku りんく', cmd: 'link' },
    { label: '目次', icon: '☰', keys: 'toc contents mokuji もくじ', cmd: 'toc' },
    { label: 'Mermaid図', icon: '◇', keys: 'mermaid diagram chart zu ma-meido ず まーめいど', cmd: 'mermaid' },
    ...panels.map((p) => ({ label: `${p.label}パネル`, icon: p.icon, keys: `panel paneru ぱねる ${p.id}`, cmd: 'panel', arg: p.id })),
  ]
}

function button(label, title, onClick) {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  if (title) b.title = title
  // エディタの選択を失わないよう、押してもフォーカスを移さない
  b.addEventListener('mousedown', (e) => e.preventDefault())
  b.addEventListener('click', onClick)
  return b
}

function sep() {
  const s = document.createElement('span')
  s.className = 'lhe-menu-sep'
  return s
}

/**
 * 「/」で開く挿入メニュー.
 * @param getItems () => 項目の配列
 * @param run      (項目) => void 選ばれた項目を実行する
 */
export function SlashCommand(getItems, run) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        // 段落・見出しの中だけ(コードブロックの中などでは出さない)
        allow: ({ state, range }) => {
          const parent = state.doc.resolve(range.from).parent
          return parent.type.name === 'paragraph' || parent.type.name === 'heading'
        },
        items: ({ query }) => {
          const q = query.toLowerCase()
          return getItems().filter((i) => !q || i.label.toLowerCase().includes(q) || i.keys.includes(q)).slice(0, 30)
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run()
          run(props)
        },
        render: () => {
          let el, props, index = 0
          const draw = () => {
            el.replaceChildren()
            if (!props.items.length) {
              const e = document.createElement('div')
              e.className = 'lhe-slash-empty'
              e.textContent = '該当する項目はありません'
              el.appendChild(e)
              return
            }
            props.items.forEach((it, i) => {
              const row = document.createElement('div')
              row.className = 'lhe-slash-item' + (i === index ? ' on' : '')
              const ic = document.createElement('span')
              ic.className = 'lhe-slash-icon'
              ic.textContent = it.icon
              row.append(ic, it.label)
              row.addEventListener('mousedown', (e) => { e.preventDefault(); props.command(it) })
              row.addEventListener('mouseenter', () => { index = i; draw() })
              el.appendChild(row)
              if (i === index) queueMicrotask(() => row.scrollIntoView({ block: 'nearest' }))
            })
          }
          const place = () => {
            const r = props.clientRect?.()
            if (!r) return
            const h = el.offsetHeight
            const below = r.bottom + 4 + h < window.innerHeight
            el.style.left = Math.min(r.left, window.innerWidth - el.offsetWidth - 8) + 'px'
            el.style.top = (below ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px'
          }
          return {
            onStart: (p) => {
              props = p
              index = 0
              el = document.createElement('div')
              el.className = 'lhe-slash'
              document.body.appendChild(el)
              draw()
              place()
            },
            onUpdate: (p) => { props = p; index = 0; draw(); place() },
            onKeyDown: ({ event }) => {
              const n = props.items.length
              if (event.key === 'ArrowDown') { if (n) { index = (index + 1) % n; draw() } return true }
              if (event.key === 'ArrowUp') { if (n) { index = (index + n - 1) % n; draw() } return true }
              if (event.key === 'Enter' || event.key === 'Tab') { if (n) { props.command(props.items[index]); return true } return false }
              if (event.key === 'Escape') { el.remove(); return true }
              return false
            },
            onExit: () => el?.remove(),
          }
        },
      })]
    },
  })
}

/** 画像・動画を選んだときに出るメニュー(寄せ・削除) */
export function MediaMenu(exec) {
  const el = document.createElement('div')
  el.className = 'lhe-bubble'
  el.append(
    button('⇤ 左寄せ', '左寄せ', () => exec('align', 'left')),
    button('↔ 中央', '中央寄せ', () => exec('align', 'center')),
    button('⇥ 右寄せ', '右寄せ', () => exec('align', 'right')),
    sep(),
    button('🗑 削除', '削除', () => exec('deleteSelection')),
  )
  return BubbleMenu.configure({
    pluginKey: 'mediaMenu',
    element: el,
    shouldShow: ({ editor, state }) => {
      const n = state.selection.node
      return editor.isEditable && !!n && (n.type.name === 'image' || n.type.name === 'video')
    },
    options: { placement: 'top', offset: 8 },
  })
}

const CELL_COLORS = [
  ['#ffffff', '白'], ['#f2f3f5', '灰'], ['#fde8e8', '赤'], ['#fff6dc', '黄'],
  ['#e6f6ea', '緑'], ['#e8f1fd', '青'], ['#f1eafd', '紫'],
]

/** 表の中にカーソルがあるときに、表の上に出るメニュー(Confluence 風) */
export function TableMenu(exec, getEditor) {
  const el = document.createElement('div')
  el.className = 'lhe-bubble lhe-table-menu'
  const colors = document.createElement('span')
  colors.className = 'lhe-swatches'
  colors.title = 'セルの背景色'
  colors.append('背景:')
  for (const [c, name] of CELL_COLORS) {
    const b = button('', `背景色: ${name}`, () => exec('cellBg', c === '#ffffff' ? '' : c))
    b.className = 'lhe-swatch'
    b.style.background = c
    colors.appendChild(b)
  }
  const custom = document.createElement('input')
  custom.type = 'color'
  custom.title = 'セルの背景色(任意の色)'
  custom.addEventListener('change', () => exec('cellBg', custom.value))
  colors.appendChild(custom)
  el.append(
    button('↑行', '上に行を追加', () => exec('addRowBefore')),
    button('↓行', '下に行を追加', () => exec('addRow')),
    button('←列', '左に列を追加', () => exec('addColBefore')),
    button('→列', '右に列を追加', () => exec('addCol')),
    sep(),
    button('行を削除', '行を削除', () => exec('delRow')),
    button('列を削除', '列を削除', () => exec('delCol')),
    sep(),
    button('結合/分割', 'セルの結合・分割', () => exec('mergeCells')),
    button('見出し行', '先頭行を見出しにする・戻す', () => exec('headerRow')),
    sep(),
    colors,
    sep(),
    button('🗑 表を削除', '表を削除', () => exec('delTable')),
  )
  /** カーソルのある表の要素 */
  const tableDom = () => {
    const ed = getEditor()
    if (!ed) return null
    const at = ed.view.domAtPos(ed.state.selection.from).node
    return (at.nodeType === 1 ? at : at.parentElement)?.closest('table') ?? null
  }
  return BubbleMenu.configure({
    pluginKey: 'tableMenu',
    element: el,
    shouldShow: ({ editor, view }) =>
      editor.isEditable && editor.isActive('table') && (view.hasFocus() || el.contains(document.activeElement)),
    getReferencedVirtualElement: () => {
      const t = tableDom()
      return t ? { getBoundingClientRect: () => t.getBoundingClientRect(), getClientRects: () => t.getClientRects() } : null
    },
    options: { placement: 'top-start', offset: 6, flip: true, shift: { padding: 8 } },
  })
}
