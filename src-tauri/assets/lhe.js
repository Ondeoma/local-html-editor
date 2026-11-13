/*
 * lhe.js - Local HTML Editor の実行時スクリプト.
 * Local HTML Editor で作ったすべてのHTMLから読み込まれ、次を描画します.
 *   - 目次:     <!--lhe:toc--> の位置に、本文の見出しから目次を作る
 *   - mermaid図: <!--lhe:mermaid--> の直後の <pre class="lhe-mermaid"> を図にする
 *   - レイアウト: 同じディレクトリに layout.html があるページは、その <!--lhe:slot--> の位置に本文を入れて表示する
 *                (head に <meta name="lhe-layout"> があるページだけ. 終わったら document に lhe:ready イベントを送る)
 * あわせて、パネル・画像の寄せなどエディタで付けた装飾の既定のスタイルを入れます.
 * このファイルはエディタがワークスペースを開くたびに上書きされます(編集しないでください).
 */
(function () {
  'use strict'

  var MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'

  var CSS = [
    '.lhe-panel{display:flex;gap:.6em;align-items:flex-start;padding:.7em 1em;margin:1em 0;border-radius:6px;background:#e8f1fd}',
    '.lhe-panel-icon{flex:none;font-size:1.2em;line-height:1.5;user-select:none}',
    '.lhe-panel-body{flex:1;min-width:0}',
    '.lhe-panel-body>:first-child{margin-top:0}.lhe-panel-body>:last-child{margin-bottom:0}',
    '.lhe-toc{margin:1em 0;padding:.6em 1em;border-left:3px solid #c8cdd3;background:rgba(127,127,127,.06)}',
    '.lhe-toc-title{font-weight:bold;margin-bottom:.3em}',
    '.lhe-toc ul{margin:0;padding-left:1.2em;list-style:none}',
    '.lhe-toc a{text-decoration:none}.lhe-toc a:hover{text-decoration:underline}',
    'pre.lhe-mermaid.lhe-rendered{display:none}',
    '.lhe-mermaid-svg{margin:1em 0;text-align:center}',
    '.lhe-mermaid-error{color:#c00;white-space:pre-wrap;font-size:.9em}',
    'img[data-align="center"],video[data-align="center"]{display:block;margin-left:auto;margin-right:auto}',
    'img[data-align="right"],video[data-align="right"]{display:block;margin-left:auto}',
    'img[data-align="left"],video[data-align="left"]{display:block;margin-right:auto}',
    'img,video{max-width:100%;height:auto}',
    '.lhe-embed iframe{width:100%;border:1px solid #d0d4d9;border-radius:6px}',
    '.lhe-file{margin:.6em 0}',
    '.lhe-file a{display:inline-flex;gap:.4em;align-items:center;padding:.4em .8em;border:1px solid #d0d4d9;border-radius:6px;text-decoration:none}',
    'table{border-collapse:collapse}',
    'td,th{border:1px solid #c8cdd3;padding:.3em .6em;vertical-align:top}',
    'th{background:rgba(127,127,127,.08)}',
    'blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid #c8cdd3;color:#555}',
    'pre{background:#f5f6f7;padding:.8em 1em;border-radius:6px;overflow:auto}',
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}'
  ].join('\n')

  function injectCss(doc) {
    doc = doc || document
    if (doc.getElementById('lhe-style')) return
    var st = doc.createElement('style')
    st.id = 'lhe-style'
    st.textContent = CSS
    // 利用者のCSSで上書きできるよう、head の先頭に入れる
    doc.head.insertBefore(st, doc.head.firstChild)
  }

  /** root 配下の、指定した名前のコメントを集めます */
  function comments(root, name) {
    var out = []
    var w = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
    var n
    while ((n = w.nextNode())) if (n.nodeValue.trim() === name) out.push(n)
    return out
  }

  function slug(text, used) {
    var base = text.trim().toLowerCase().replace(/[\s　]+/g, '-').replace(/[^\w\-぀-ヿ㐀-鿿]/g, '') || 'h'
    var id = base
    var i = 1
    while (used[id] || document.getElementById(id)) id = base + '-' + i++
    used[id] = true
    return id
  }

  /** 見出しの一覧 [{level, text, id}] (id のない見出しには付けます) */
  function headings(root) {
    var used = {}
    return Array.prototype.slice.call(root.querySelectorAll('h1,h2,h3,h4'))
      .filter(function (h) { return !h.closest('.lhe-toc') })
      .map(function (h) {
        if (!h.id) h.id = slug(h.textContent, used)
        return { level: Number(h.tagName.charAt(1)), text: h.textContent, id: h.id }
      })
  }

  /** 見出しの一覧から目次(nav要素)を作ります */
  function buildToc(list, doc) {
    doc = doc || document
    var nav = doc.createElement('nav')
    nav.className = 'lhe-toc'
    var title = doc.createElement('div')
    title.className = 'lhe-toc-title'
    title.textContent = '目次'
    nav.appendChild(title)
    if (!list.length) {
      var empty = doc.createElement('div')
      empty.textContent = '(見出しがありません)'
      empty.style.opacity = '.6'
      nav.appendChild(empty)
      return nav
    }
    var min = Math.min.apply(null, list.map(function (h) { return h.level }))
    var ul = doc.createElement('ul')
    nav.appendChild(ul)
    list.forEach(function (h) {
      var li = doc.createElement('li')
      li.style.paddingLeft = (h.level - min) * 1.2 + 'em'
      var a = doc.createElement('a')
      if (h.id) a.href = '#' + encodeURIComponent(h.id)
      a.textContent = h.text
      li.appendChild(a)
      ul.appendChild(li)
    })
    return nav
  }

  function renderToc(root) {
    root = root || document.body
    var anchors = comments(root, 'lhe:toc')
    if (!anchors.length) return
    var list = headings(root)
    anchors.forEach(function (c) {
      var next = c.nextSibling
      if (next && next.nodeType === 1 && next.classList.contains('lhe-toc')) next.remove()
      c.parentNode.insertBefore(buildToc(list), c.nextSibling)
    })
  }

  var mermaidLoading = null

  /** mermaid を用意します(読み込み済みでなければCDNから読み込む) */
  function loadMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid)
    if (mermaidLoading) return mermaidLoading
    mermaidLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script')
      s.src = MERMAID_CDN
      s.onload = function () {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        resolve(window.mermaid)
      }
      s.onerror = function () { reject(new Error('mermaid を読み込めませんでした(ネットワークを確認してください)')) }
      document.head.appendChild(s)
    })
    return mermaidLoading
  }

  var seq = 0

  /** mermaid のコードを図(SVG)にして el に描画します */
  function renderMermaidInto(el, code) {
    return loadMermaid().then(function (m) {
      return m.render('lhe-mermaid-' + Date.now() + '-' + seq++, code)
    }).then(function (r) {
      el.innerHTML = r.svg
    }, function (e) {
      el.innerHTML = ''
      var d = document.createElement('div')
      d.className = 'lhe-mermaid-error'
      d.textContent = String((e && e.message) || e)
      el.appendChild(d)
    })
  }

  function renderMermaid(root) {
    root = root || document.body
    comments(root, 'lhe:mermaid').forEach(function (c) {
      var pre = c.nextElementSibling || c.nextSibling
      while (pre && pre.nodeType !== 1) pre = pre.nextSibling
      if (!pre || !pre.classList.contains('lhe-mermaid')) return
      var out = pre.nextElementSibling
      if (!out || !out.classList.contains('lhe-mermaid-svg')) {
        out = document.createElement('div')
        out.className = 'lhe-mermaid-svg'
        pre.parentNode.insertBefore(out, pre.nextSibling)
      }
      pre.classList.add('lhe-rendered')
      renderMermaidInto(out, pre.textContent)
    })
  }

  /** root 直下の、lhe:content の目印の間のノード(目印がなければ全部) */
  function contentNodes(root) {
    var nodes = Array.prototype.slice.call(root.childNodes)
    var s = -1, e = nodes.length
    nodes.forEach(function (n, i) {
      if (n.nodeType !== 8) return
      var v = n.nodeValue.trim()
      if (v === 'lhe:content') s = i
      else if (v === '/lhe:content') e = i
    })
    return nodes.slice(s + 1, e).filter(function (n) { return !(n.nodeType === 1 && n.tagName === 'SCRIPT') })
  }

  /** layout.html を読み込み、その「コンテンツ枠」にこのページの本文を入れて表示します */
  function applyLayout() {
    var meta = document.querySelector('meta[name="lhe-layout"]')
    if (!meta) return Promise.resolve(false)
    return fetch(meta.getAttribute('content'), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('layout: ' + r.status); return r.text() })
      .then(function (text) {
        var ldoc = new DOMParser().parseFromString(text, 'text/html')
        var frag = document.createDocumentFragment()
        contentNodes(ldoc.body).forEach(function (n) { frag.appendChild(document.importNode(n, true)) })
        var slot = comments(frag, 'lhe:slot')[0]
        var page = document.createElement('div')
        page.className = 'lhe-page'
        var mine = contentNodes(document.body)
        var anchor = mine.length ? mine[mine.length - 1].nextSibling : null
        mine.forEach(function (n) { page.appendChild(n) })
        if (slot) slot.parentNode.replaceChild(page, slot)
        else frag.appendChild(page) // 枠がなければ末尾に置く
        document.body.insertBefore(frag, anchor)
        return true
      })
      .catch(function (e) { console.warn('[lhe] レイアウトを適用できませんでした', e) })
  }

  function showBody() {
    var hide = document.getElementById('lhe-layout-hide')
    if (hide) hide.remove()
  }

  window.LHE = {
    applyLayout: applyLayout,
    css: CSS,
    injectCss: injectCss,
    headings: headings,
    buildToc: buildToc,
    renderToc: renderToc,
    loadMermaid: loadMermaid,
    renderMermaidInto: renderMermaidInto,
    renderMermaid: renderMermaid
  }

  // エディタの中では自動で描画しない(エディタ側で描画する)
  if (window.LHE_EDITOR) return

  function init() {
    injectCss(document)
    applyLayout().then(function () {
      showBody()
      renderToc(document.body)
      renderMermaid(document.body)
      document.dispatchEvent(new CustomEvent('lhe:ready'))
    })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
