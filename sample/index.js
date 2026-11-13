// index.html だけのスクリプト(HTMLと同じ名前の .js)
//   1. 本文中の「{{時刻}}」という文字を、1秒ごとに更新される時計に置き換える
//   2. 表の見出し(1行目)をクリックすると、その列で並べ替える
(function () {
  'use strict'

  // 1. {{時刻}} を時計に置き換える(エディタで本文に「{{時刻}}」と書くだけで動く)
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const targets = []
  let n
  while ((n = walker.nextNode())) if (n.nodeValue.includes('{{時刻}}')) targets.push(n)
  targets.forEach((t) => {
    const [before, after] = t.nodeValue.split('{{時刻}}')
    const clock = document.createElement('strong')
    const tick = () => (clock.textContent = new Date().toLocaleTimeString('ja-JP'))
    tick()
    setInterval(tick, 1000)
    t.replaceWith(before, clock, after)
  })

  // 2. 表の並べ替え
  document.querySelectorAll('table').forEach((table) => {
    const rows = [...table.querySelectorAll('tr')]
    const head = rows.shift()
    if (!head) return
    let asc = true
    head.querySelectorAll('th').forEach((th, col) => {
      th.classList.add('sortable')
      th.title = 'クリックで並べ替え'
      th.addEventListener('click', () => {
        const key = (tr) => tr.children[col]?.textContent.trim() ?? ''
        rows.sort((a, b) => {
          const x = key(a), y = key(b)
          const nx = Number(x), ny = Number(y)
          const r = !isNaN(nx) && !isNaN(ny) && x !== '' && y !== '' ? nx - ny : x.localeCompare(y, 'ja')
          return asc ? r : -r
        })
        asc = !asc
        rows.forEach((tr) => tr.parentElement.appendChild(tr))
      })
    })
  })

  console.log('[index.js] 読み込みました')
})()
