// ワークスペース全体の共通スクリプト(全HTMLが読み込む. lhe.js の後に読み込まれる)
// エディタの「プレビュー」で、次の動作を確認できます.
//   1. 右上に「JS 動作中」のバッジを出す
//   2. コードブロックに「コピー」ボタンを付ける
//   3. スクロールすると右下に「ページ上部へ」ボタンを出す
//   4. 外部リンク(http/https)を新しいタブで開く
(function () {
  'use strict'

  // 1. JSが動いていることが分かるバッジ
  const badge = document.createElement('span')
  badge.className = 'js-badge'
  badge.textContent = 'JS 動作中: ' + new Date().toLocaleTimeString('ja-JP')
  badge.style.cssText = 'position:fixed;top:.6rem;right:.6rem;'
  document.body.appendChild(badge)

  // 2. コードブロックのコピーボタン
  document.querySelectorAll('pre:not(.lhe-mermaid)').forEach((pre) => {
    const b = document.createElement('button')
    b.className = 'copy-btn'
    b.textContent = 'コピー'
    b.addEventListener('click', async () => {
      await navigator.clipboard.writeText(pre.innerText.replace(/^コピー/, ''))
      b.textContent = 'コピーしました'
      setTimeout(() => (b.textContent = 'コピー'), 1500)
    })
    pre.prepend(b)
  })

  // 3. ページ上部へ戻るボタン
  const top = document.createElement('button')
  top.className = 'to-top'
  top.title = 'ページ上部へ'
  top.textContent = '↑'
  top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
  document.body.appendChild(top)
  window.addEventListener('scroll', () => { top.style.display = window.scrollY > 200 ? 'block' : 'none' })

  // 4. 外部リンクは新しいタブで
  document.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener' })

  console.log('[script.js] 読み込みました')
})()
