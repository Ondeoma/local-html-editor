// HTMLの WYSIWYG エディタ(Tiptap). 画面(Scalactive)からは createWysiwyg を通して使う.
import { Editor, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table'
import { NodeSelection } from '@tiptap/pm/state'
import { uploadAsset, fileUrl, isRelativeUrl, pickFiles } from './host.js'
import { prompt } from './dialog.js'
import { Placeholder } from '@tiptap/extensions'
import DragHandle from '@tiptap/extension-drag-handle'
import { SlashCommand, MediaMenu, TableMenu, slashItems } from './menus.js'

/** パネルの組み合わせ(アイコン・背景色) */
export const PANEL_PRESETS = [
  { id: 'info', label: '情報', icon: 'ℹ️', color: '#e8f1fd' },
  { id: 'warn', label: '注意', icon: '⚠️', color: '#fff6dc' },
  { id: 'ok', label: '成功', icon: '✅', color: '#e6f6ea' },
  { id: 'error', label: 'エラー', icon: '⛔', color: '#fde8e8' },
  { id: 'memo', label: 'メモ', icon: '📝', color: '#f1eafd' },
]

// ---- 拡張 ----

/** 寄せ(左・中央・右). 画像・動画は data-align で持ち、配置は lhe.js のCSSで行う */
const alignAttr = {
  align: {
    default: null,
    parseHTML: (el) => { const v = el.getAttribute('data-align'); return ['left', 'center', 'right'].includes(v) ? v : null },
    renderHTML: (a) => (a.align ? { 'data-align': a.align } : {}),
  },
}

const JUSTIFY = { center: 'center', right: 'flex-end' }

const LheImage = Image.extend({
  addAttributes() { return { ...this.parent?.(), ...alignAttr } },
  // 大きさを変えられる表示(親)に、寄せの指定を反映する
  addNodeView() {
    const parent = this.parent?.()
    if (!parent) return null
    return (props) => {
      const nv = parent(props)
      const apply = (n) => { nv.dom.style.justifyContent = JUSTIFY[n.attrs.align] ?? 'flex-start' }
      apply(props.node)
      const update = nv.update?.bind(nv)
      nv.update = (n, ...rest) => {
        const ok = update ? update(n, ...rest) : n.type === props.node.type
        if (ok) apply(n)
        return ok
      }
      return nv
    }
  },
}).configure({
  inline: false,
  allowBase64: true,
  resize: { enabled: true, directions: ['left', 'right', 'bottom-left', 'bottom-right'], minWidth: 32, minHeight: 24, alwaysPreserveAspectRatio: true },
})

/** 表のセルの背景色(style の background-color) */
const bgAttr = {
  backgroundColor: {
    default: null,
    parseHTML: (el) => el.style.backgroundColor || null,
    renderHTML: (a) => (a.backgroundColor ? { style: `background-color: ${a.backgroundColor}` } : {}),
  },
}
const LheCell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr } } })
const LheHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr } } })

const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      width: { default: null, parseHTML: (el) => el.getAttribute('width'), renderHTML: (a) => (a.width ? { width: a.width } : {}) },
      ...alignAttr,
    }
  },
  parseHTML() { return [{ tag: 'video[src]' }, { tag: 'video', getAttrs: (el) => ({ src: el.querySelector('source')?.getAttribute('src') }) }] },
  renderHTML({ HTMLAttributes }) { return ['video', mergeAttributes(HTMLAttributes, { controls: 'true' })] },
})

/** 添付ファイル(ダウンロードリンク) */
const FileBlock = Node.create({
  name: 'fileBlock',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() { return { href: { default: null }, name: { default: '' } } },
  parseHTML() {
    return [{ tag: 'div.lhe-file', getAttrs: (el) => { const a = el.querySelector('a'); return { href: a?.getAttribute('href'), name: a?.textContent?.replace(/^📎\s*/, '') ?? '' } } }]
  },
  renderHTML({ node }) {
    return ['div', { class: 'lhe-file' }, ['a', { href: node.attrs.href, download: node.attrs.name }, `📎 ${node.attrs.name}`]]
  },
})

/** 他ページ・外部ページの埋め込み(iframe) */
const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() { return { src: { default: null }, height: { default: '400' } } },
  parseHTML() {
    return [{ tag: 'div.lhe-embed', getAttrs: (el) => { const f = el.querySelector('iframe'); return { src: f?.getAttribute('src'), height: f?.getAttribute('height') || '400' } } }]
  },
  renderHTML({ node }) {
    return ['div', { class: 'lhe-embed' }, ['iframe', { src: node.attrs.src, height: node.attrs.height, loading: 'lazy' }]]
  },
  // エディタの中では iframe を覆い、クリック・右クリックを iframe に渡さない(選択・移動できるように)
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.className = 'lhe-embed lhe-embed-view'
      const f = document.createElement('iframe')
      f.src = node.attrs.src
      f.height = node.attrs.height
      f.loading = 'lazy'
      const cover = document.createElement('div')
      cover.className = 'lhe-embed-cover'
      cover.title = node.attrs.src
      dom.append(f, cover)
      return { dom, ignoreMutation: () => true }
    }
  },
})

/** アイコンと背景色の付いた囲み */
const Panel = Node.create({
  name: 'panel',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      icon: { default: 'ℹ️', parseHTML: (el) => el.getAttribute('data-icon') || 'ℹ️', renderHTML: (a) => ({ 'data-icon': a.icon }) },
      color: { default: '#e8f1fd', parseHTML: (el) => el.style.backgroundColor || '#e8f1fd', renderHTML: (a) => ({ style: `background-color: ${a.color}` }) },
    }
  },
  parseHTML() { return [{ tag: 'div.lhe-panel', contentElement: '.lhe-panel-body' }] },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'lhe-panel' }),
      ['span', { class: 'lhe-panel-icon', contenteditable: 'false' }, node.attrs.icon],
      ['div', { class: 'lhe-panel-body' }, 0]]
  },
})

/** 目次. 保存時は <!--lhe:toc--> だけを残し、表示は lhe.js が行う */
const Toc = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  draggable: true,
  parseHTML() { return [{ tag: 'div[data-lhe-toc]' }] },
  renderHTML() { return ['div', { 'data-lhe-toc': '' }] },
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('div')
      dom.className = 'lhe-toc-view'
      const render = () => {
        const list = []
        editor.state.doc.descendants((n) => {
          if (n.type.name === 'heading') list.push({ level: n.attrs.level, text: n.textContent, id: '' })
        })
        dom.replaceChildren(window.LHE.buildToc(list))
      }
      render()
      editor.on('update', render)
      return { dom, destroy: () => editor.off('update', render), ignoreMutation: () => true }
    }
  },
})

/** layout.html の「コンテンツ枠」. 同じディレクトリの各ページの本文がここに入る. 保存時は <!--lhe:slot--> だけを残す */
const Slot = Node.create({
  name: 'slot',
  group: 'block',
  atom: true,
  draggable: true,
  parseHTML() { return [{ tag: 'div[data-lhe-slot]' }] },
  renderHTML() { return ['div', { 'data-lhe-slot': '' }] },
  addNodeView() {
    return () => {
      const dom = document.createElement('div')
      dom.className = 'lhe-slot-view'
      dom.textContent = '📄 コンテンツ枠(同じディレクトリの各ページの本文がここに入ります)'
      return { dom, ignoreMutation: () => true }
    }
  },
})

/** ブロックの左に出る、ドラッグで並べ替えるためのつまみ */
function dragHandle() {
  return DragHandle.configure({
    render: () => {
      const el = document.createElement('div')
      el.className = 'lhe-drag-handle'
      el.textContent = '⠿'
      el.title = 'ドラッグで移動'
      return el
    },
  })
}

/** mermaid図. 保存時は <!--lhe:mermaid--> と <pre class="lhe-mermaid">コード</pre> を残す */
const Mermaid = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() { return { code: { default: 'graph TD\n  A[開始] --> B[終了]' } } },
  parseHTML() { return [{ tag: 'pre.lhe-mermaid', priority: 100, getAttrs: (el) => ({ code: el.textContent }) }] },
  renderHTML({ node }) { return ['pre', { class: 'lhe-mermaid' }, node.attrs.code] },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let cur = node
      const dom = document.createElement('div')
      dom.className = 'lhe-mermaid-view'
      const bar = document.createElement('div')
      bar.className = 'lhe-mermaid-bar'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = '✎ コードを編集'
      bar.append('Mermaid図', btn)
      const ta = document.createElement('textarea')
      ta.spellcheck = false
      ta.value = node.attrs.code
      ta.hidden = true
      const out = document.createElement('div')
      out.className = 'lhe-mermaid-svg'
      dom.append(bar, ta, out)
      let timer = 0
      const draw = () => window.LHE.renderMermaidInto(out, cur.attrs.code)
      draw()
      btn.addEventListener('click', () => {
        ta.hidden = !ta.hidden
        btn.textContent = ta.hidden ? '✎ コードを編集' : '✓ 編集を閉じる'
        if (!ta.hidden) ta.focus()
      })
      ta.addEventListener('input', () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          const pos = getPos()
          if (typeof pos === 'number') editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'code', ta.value))
        }, 400)
      })
      return {
        dom,
        update: (n) => {
          if (n.type !== cur.type) return false
          const changed = n.attrs.code !== cur.attrs.code
          cur = n
          if (changed) {
            if (document.activeElement !== ta) ta.value = n.attrs.code
            draw()
          }
          return true
        },
        stopEvent: (e) => ta.contains(e.target) || bar.contains(e.target),
        ignoreMutation: () => true,
        destroy: () => clearTimeout(timer),
      }
    }
  },
})

// ---- 読み込み・保存時の変換 ----

/** 保存したHTML → エディタに入れるHTML(目次の目印をノードに、相対パスを表示用のURLに) */
function toEditor(html, base) {
  html = html.replace(/<!--\s*lhe:toc\s*-->/g, '<div data-lhe-toc></div>').replace(/<!--\s*lhe:slot\s*-->/g, '<div data-lhe-slot></div>')
  const t = document.createElement('template')
  t.innerHTML = html
  t.content.querySelectorAll('[src]').forEach((el) => {
    const v = el.getAttribute('src')
    if (isRelativeUrl(v)) el.setAttribute('src', base + v)
  })
  // lhe.js が描画した結果が保存されていた場合は取り除く
  t.content.querySelectorAll('nav.lhe-toc, .lhe-mermaid-svg').forEach((el) => el.remove())
  return t.innerHTML
}

/** エディタのHTML → 保存するHTML */
function fromEditor(html, base) {
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html
    .replace(new RegExp(`(src|href)="${esc}`, 'g'), '$1="')
    .replace(/<div data-lhe-toc="?"?><\/div>/g, '<!--lhe:toc-->')
    .replace(/<div data-lhe-slot="?"?><\/div>/g, '<!--lhe:slot-->')
    .replace(/<pre class="lhe-mermaid">/g, '<!--lhe:mermaid-->\n<pre class="lhe-mermaid">')
    .replace(/ contenteditable="false"/g, '')
    // 読みやすさのため、ブロックの終わりで改行する(表のセルなど、閉じタグが続く所は除く)
    .replace(/(<\/(?:p|h[1-6]|ul|ol|table|blockquote|pre|div|figure)>|<hr>|<!--lhe:toc-->|<!--lhe:slot-->)(?!\n|<\/)/g, '$1\n')
    .trim()
}

/** 表示中のHTMLから、ページのタイトル(最初の見出し)を取り出す */
function titleOf(editor) {
  let t = ''
  editor.state.doc.descendants((n) => {
    if (!t && n.type.name === 'heading') t = n.textContent.trim()
    return !t
  })
  return t
}

// ---- 本体 ----

/**
 * WYSIWYG エディタを el に作ります.
 * @param opts.htmlPath ワークスペースからのHTMLの相対パス
 * @param opts.html     本文(保存されている形)
 * @param opts.onChange (本文, タイトル) => void
 * @param opts.onState  (ツールバーに出す状態) => void
 * @param opts.pages    () => 埋め込み候補のHTMLのパス(このHTMLからの相対パス)の配列
 */
export function createWysiwyg(el, opts) {
  const dir = opts.htmlPath.includes('/') ? opts.htmlPath.slice(0, opts.htmlPath.lastIndexOf('/') + 1) : ''
  const base = fileUrl(dir)
  let silent = false
  // メニュー(拡張)から、後で定義する commands を呼ぶため
  const exec = (name, arg) => { const f = commands[name]; if (f) f(arg); else console.warn('不明なコマンド', name) }
  const isLayout = /(^|\/)layout\.html?$/i.test(opts.htmlPath)
  const items = slashItems(PANEL_PRESETS).concat(isLayout
    ? [{ label: 'コンテンツ枠', icon: '📄', keys: 'slot content layout kontentsu waku こんてんつ わく', cmd: 'slot' }]
    : [])

  const editor = new Editor({
    element: el,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: { openOnClick: false, autolink: true } }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({ table: { resizable: true }, tableCell: false, tableHeader: false }),
      LheCell,
      LheHeader,
      LheImage,
      Video,
      FileBlock,
      Embed,
      Panel,
      Toc,
      Mermaid,
      Slot,
      dragHandle(),
      Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? '見出し' : '「/」で見出し・表・画像などを挿入') }),
      SlashCommand(() => items, (it) => exec(it.cmd, it.arg)),
      MediaMenu(exec),
      TableMenu(exec, () => editor),
    ],
    content: toEditor(opts.html || '<p></p>', base),
    editorProps: {
      handlePaste: (_view, e) => { const fs = [...(e.clipboardData?.files ?? [])]; if (!fs.length) return false; insertFiles(fs); return true },
      handleDrop: (view, e) => {
        const fs = [...(e.dataTransfer?.files ?? [])]
        if (!fs.length) return false
        const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos
        insertFiles(fs, pos)
        return true
      },
      handleClickOn: (_view, _pos, node, nodePos, e) => {
        if (node.type.name === 'panel' && e.target.closest?.('.lhe-panel-icon')) {
          prompt('パネルのアイコン(絵文字)', node.attrs.icon).then((v) => {
            if (v) editor.view.dispatch(editor.state.tr.setNodeAttribute(nodePos, 'icon', v))
          })
          return true
        }
        return false
      },
    },
    onUpdate: () => { if (!silent) opts.onChange?.(fromEditor(editor.getHTML(), base), titleOf(editor)) },
    onSelectionUpdate: () => emitState(),
    onTransaction: () => emitState(),
  })

  function selectedMedia() {
    const sel = editor.state.selection
    return sel instanceof NodeSelection && ['image', 'video'].includes(sel.node.type.name) ? sel : null
  }

  function emitState() {
    if (!opts.onState) return
    const e = editor
    let heading = 0
    for (const l of [1, 2, 3, 4]) if (e.isActive('heading', { level: l })) heading = l
    const media = selectedMedia()
    const align = media ? media.node.attrs.align || 'left'
      : ['center', 'right'].find((a) => e.isActive({ textAlign: a })) || 'left'
    opts.onState({
      heading,
      bold: e.isActive('bold'), italic: e.isActive('italic'), strike: e.isActive('strike'), underline: e.isActive('underline'),
      code: e.isActive('code'), link: e.isActive('link'),
      bulletList: e.isActive('bulletList'), orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'), codeBlock: e.isActive('codeBlock'),
      table: e.isActive('table'), panel: e.isActive('panel'), media: !!media, align,
      color: e.getAttributes('textStyle').color || '',
    })
  }

  /** ファイルを _IMG に保存して挿入します(画像・動画はそのまま表示、それ以外はファイルのリンク) */
  async function insertFiles(files, pos) {
    const nodes = []
    for (const f of files) {
      const rel = await uploadAsset(opts.htmlPath, f)
      const src = base + rel
      if (f.type.startsWith('image/')) nodes.push({ type: 'image', attrs: { src, alt: f.name } })
      else if (f.type.startsWith('video/')) nodes.push({ type: 'video', attrs: { src } })
      else nodes.push({ type: 'fileBlock', attrs: { href: src, name: f.name } })
    }
    if (!nodes.length) return
    const c = editor.chain().focus()
    ;(pos == null ? c.insertContent(nodes) : c.insertContentAt(pos, nodes)).run()
  }

  async function pickAndInsert(accept) {
    const fs = await pickFiles(accept)
    if (fs.length) await insertFiles(fs)
  }

  async function link() {
    const prev = editor.getAttributes('link').href || ''
    const v = await prompt('リンク先のURL(空にすると解除)', prev, opts.pages?.() ?? [])
    if (v === null) return
    const c = editor.chain().focus().extendMarkRange('link')
    if (!v) c.unsetLink().run()
    else if (editor.state.selection.empty && !editor.isActive('link')) c.insertContent({ type: 'text', text: v, marks: [{ type: 'link', attrs: { href: v } }] }).run()
    else c.setLink({ href: v }).run()
  }

  async function embed() {
    const v = await prompt('埋め込むページ(ワークスペース内のHTML、または https のURL)', '', opts.pages?.() ?? [])
    if (!v) return
    const src = isRelativeUrl(v) ? base + v : v
    editor.chain().focus().insertContent({ type: 'embed', attrs: { src } }).run()
  }

  function setAlign(a) {
    const media = selectedMedia()
    if (media) editor.view.dispatch(editor.state.tr.setNodeAttribute(media.from, 'align', a === 'left' ? null : a))
    else editor.chain().focus().setTextAlign(a).run()
  }

  const c = () => editor.chain().focus()
  const commands = {
    undo: () => c().undo().run(),
    redo: () => c().redo().run(),
    heading: (lv) => (Number(lv) ? c().setHeading({ level: Number(lv) }).run() : c().setParagraph().run()),
    bold: () => c().toggleBold().run(),
    italic: () => c().toggleItalic().run(),
    strike: () => c().toggleStrike().run(),
    underline: () => c().toggleUnderline().run(),
    code: () => c().toggleCode().run(),
    color: (v) => (v ? c().setColor(v).run() : c().unsetColor().run()),
    align: setAlign,
    bulletList: () => c().toggleBulletList().run(),
    orderedList: () => c().toggleOrderedList().run(),
    blockquote: () => c().toggleBlockquote().run(),
    codeBlock: () => c().toggleCodeBlock().run(),
    hr: () => c().setHorizontalRule().run(),
    link,
    table: () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    addRow: () => c().addRowAfter().run(),
    addRowBefore: () => c().addRowBefore().run(),
    addCol: () => c().addColumnAfter().run(),
    addColBefore: () => c().addColumnBefore().run(),
    headerRow: () => c().toggleHeaderRow().run(),
    deleteSelection: () => c().deleteSelection().run(),
    delRow: () => c().deleteRow().run(),
    delCol: () => c().deleteColumn().run(),
    delTable: () => c().deleteTable().run(),
    mergeCells: () => c().mergeOrSplit().run(),
    cellBg: (v) => c().setCellAttribute('backgroundColor', v || null).run(),
    image: () => pickAndInsert('image/*'),
    video: () => pickAndInsert('video/*'),
    file: () => pickAndInsert(''),
    embed,
    panel: (id) => {
      const p = PANEL_PRESETS.find((x) => x.id === id) ?? PANEL_PRESETS[0]
      if (editor.isActive('panel')) return c().updateAttributes('panel', { icon: p.icon, color: p.color }).run()
      return c().wrapIn('panel', { icon: p.icon, color: p.color }).run()
    },
    panelColor: (v) => c().updateAttributes('panel', { color: v }).run(),
    unpanel: () => c().lift('panel').run(),
    toc: () => c().insertContent({ type: 'toc' }).run(),
    mermaid: () => c().insertContent({ type: 'mermaid' }).run(),
    // コンテンツ枠は layout.html に1つだけ
    slot: () => {
      if (!isLayout) return
      let exists = false
      editor.state.doc.descendants((n) => { if (n.type.name === 'slot') exists = true; return !exists })
      if (exists) prompt('コンテンツ枠は1つだけ置けます(既にあります)', '')
      else c().insertContent({ type: 'slot' }).run()
    },
  }

  // 本文の下の余白など、エディタの外側に落とされたファイルは末尾に入れる
  const onHostDrop = (e) => {
    if (editor.view.dom.contains(e.target)) return
    const fs = [...(e.dataTransfer?.files ?? [])]
    if (!fs.length) return
    e.preventDefault()
    insertFiles(fs, editor.state.doc.content.size)
  }
  const onHostOver = (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault() }
  el.addEventListener('drop', onHostDrop)
  el.addEventListener('dragover', onHostOver)

  emitState()

  return {
    exec,
    /** 他の画面で保存された内容に差し替えます(変更通知は出さない) */
    setContent: (html) => {
      silent = true
      try { editor.commands.setContent(toEditor(html, base), { emitUpdate: false }) } finally { silent = false }
    },
    focus: () => editor.commands.focus(),
    destroy: () => {
      el.removeEventListener('drop', onHostDrop)
      el.removeEventListener('dragover', onHostOver)
      editor.destroy()
    },
  }
}
