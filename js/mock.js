// 開発用: Tauri の外(普通のブラウザ)で画面を確かめるための、メモリ上の仮のワークスペース.
// npm run dev:vite で開いたときだけ使われる(Tauri の中やビルドでは使わない).
import { mockIPC } from '@tauri-apps/api/mocks'

const files = new Map([
  ['index.html', '<!-- lhe:content -->\n<h1>はじめに</h1>\n<!--lhe:toc-->\n<h2>概要</h2>\n<p>サンプルです。</p>\n<!--lhe:mermaid-->\n<pre class="lhe-mermaid">graph LR\n  A--&gt;B</pre>\n<!-- /lhe:content -->'],
  ['style.css', 'body { font-family: sans-serif; }\n'],
  ['docs/guide.html', '<!-- lhe:content -->\n<h1>ガイド</h1><p>本文</p><img src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27200%27 height=%27100%27%3E%3Crect width=%27200%27 height=%27100%27 fill=%27%232f6fd8%27/%3E%3C/svg%3E" alt="sample">\n<!-- /lhe:content -->'],
])
const dirs = new Set(['docs'])
files.set('docs/layout.html', '<!-- lhe:content -->\n<p>ヘッダー</p>\n<!--lhe:slot-->\n<p>フッター</p>\n<!-- /lhe:content -->')

function tree(prefix) {
  const names = new Set()
  for (const p of [...files.keys(), ...dirs]) if (p.startsWith(prefix)) names.add(p.slice(prefix.length).split('/')[0])
  return [...names].map((name) => {
    const path = prefix + name
    const dir = dirs.has(path)
    return { name, path, dir, children: dir ? tree(path + '/') : [] }
  }).filter((e) => e.dir || /\.html?$/.test(e.name))
    .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name))
}

const content = (h) => { const m = h.match(/<!-- lhe:content -->([\s\S]*)<!-- \/lhe:content -->/); return (m ? m[1] : h).trim() }

mockIPC((cmd, a) => {
  switch (cmd) {
    case 'recent_list': return ['/mock/workspace']
    case 'recent_remove': return null
    case 'open_workspace': return '/mock/workspace'
    case 'list_tree': return tree('')
    case 'create_dir': dirs.add(a.path); return null
    case 'create_html': { const p = /\.html?$/.test(a.path) ? a.path : a.path + '.html'; files.set(p, '<!-- lhe:content -->\n<p></p>\n<!-- /lhe:content -->'); return p }
    case 'read_text': return files.get(a.path) ?? null
    case 'write_text': files.set(a.path, a.content); return null
    case 'load_html': return content(files.get(a.path) ?? '')
    case 'save_html': files.set(a.path, `<!-- lhe:content -->\n${a.content}\n<!-- /lhe:content -->`); console.log('[mock] save_html', a.path, a.title, a.content); return null
    case 'save_asset': return 'mock_IMG/file.png'
    case 'copy_name': return a.path.replace(/\.html$/, '_copy.html')
    case 'duplicate_html': { const p = (a.path.includes('/') ? a.path.slice(0, a.path.lastIndexOf('/') + 1) : '') + (a.name.endsWith('.html') ? a.name : a.name + '.html'); files.set(p, files.get(a.path)); return p }
    case 'children_html': return a.desc ? '<ul><li><a href="#">B</a></li><li><a href="#">A</a></li></ul>' : '<ul><li><a href="#">A</a></li><li><a href="#">B</a></li></ul>'
    case 'reveal': console.log('[mock] reveal', a.path); return null
    case 'plugin:dialog|open': return '/mock/workspace'
    default: throw new Error('mock: unknown command ' + cmd)
  }
})
window.__lheMockFiles = files
