<script lang="scala">
import lhe.{Drag, Fuzzy, Host, Store}

import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue

// ワークスペースを開いた後の画面: 左にツリー、右に編集領域
case class State(sideWidth: RV[Int] = RV(260), filter: RV[String] = RV(""))

def initState() = State()

def wsName: String = Store.workspace.v.map(_.split("[/\\\\]").filter(_.nonEmpty).lastOption.getOrElse("/")).getOrElse("")

def newHtml(parent: String): Unit = Dialogs.prompt("新しいHTMLファイルの名前", "page.html").foreach(_.filter(_.nonEmpty).foreach(Store.createHtml(parent, _)))

def newDir(parent: String): Unit = Dialogs.prompt("新しいディレクトリの名前").foreach(_.filter(_.nonEmpty).foreach(Store.createDir(parent, _)))

/** フィルタに一致したHTML(点数の高い順) */
def hits(q: String): List[Fuzzy.Hit] = Fuzzy.filter(q, Store.allHtml)

/** Enter で先頭の候補を開く */
def openFirst(s: State): Unit = hits(s.filter.v).headOption.foreach(h => Store.openFile(h.path))

def startResize(s: State, e: MouseEvent): Unit = {
  e.preventDefault()
  val x0 = e.clientX
  val w0 = s.sideWidth.v
  Drag.start(ev => s.sideWidth := math.max(160, math.min(600, (w0 + ev.clientX - x0).toInt)))
}
</script>

<template>
  <div class="bench">
    <aside class="side" :style='s"width: ${s.sideWidth.v}px"'>
      <div class="side-head">
        <span class="ws" :title="Store.workspace.v.getOrElse(&quot;&quot;)">{{ wsName }}</span>
        <button title="新しいHTMLファイル" @click='newHtml("")'>＋📄</button>
        <button title="新しいディレクトリ" @click='newDir("")'>＋📁</button>
        <button title="layout.html を作成(直下のページを囲むレイアウト)" @click='Store.createLayout("")'>＋🧩</button>
        <button title="ツリーを再読み込み" @click="Store.reloadTree()">⟳</button>
        <button title="ワークスペースをFinderで表示" @click='Host.reveal("").failed.foreach(Host.report)'>📂</button>
        <button title="ワークスペースを閉じる" @click="Store.close()">⏏</button>
      </div>
      <div class="filter">
        <input type="search" v-model="s.filter" placeholder="🔍 ファイルを絞り込み(曖昧検索)" spellcheck="false"
               @keydown.enter="openFirst(s)" @keydown.esc='s.filter := ""'>
      </div>
      <div v-if="s.filter.v.trim.nonEmpty" class="tree">
        <div v-for="h in hits(s.filter.v)" :key="h.path" class="hit" :class='Map("active" -> Store.activePane.exists(_.file.v.contains(h.path)))'
             :title="h.path" @click="Store.openFile(h.path)">
          <span v-for="g in h.segments" :class='Map("m" -> g._2)'>{{ g._1 }}</span>
        </div>
        <p v-if="hits(s.filter.v).isEmpty" class="muted empty">一致するファイルはありません</p>
      </div>
      <div v-else class="tree">
        <TreeNode v-for="e in Store.tree" :key="e.path" :entry="e" :depth="0" :onNewHtml="newHtml" :onNewDir="newDir" />
        <p v-if="Store.tree.v.isEmpty" class="muted empty">HTMLファイルがありません。＋📄 で作成できます。</p>
      </div>
    </aside>
    <div class="side-resizer" @mousedown="startResize(s, event.asInstanceOf[MouseEvent])"></div>
    <main class="main">
      <LayoutView :layout="Store.layout.v" />
    </main>
  </div>
</template>

<style scoped>
.bench { flex: 1; display: flex; min-height: 0; }
.side { flex: none; display: flex; flex-direction: column; background: var(--side); border-right: 1px solid var(--line); min-width: 0; }
.side-head { display: flex; align-items: center; gap: 2px; padding: 6px 6px 6px 10px; border-bottom: 1px solid var(--line); }
.side-head button { padding: 2px 5px; font-size: .8rem; border: none; background: transparent; }
.side-head button:hover { background: var(--hover); }
.ws { flex: 1; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree { flex: 1; overflow: auto; padding: 4px 0; }
.filter { padding: 6px 8px; border-bottom: 1px solid var(--line); }
.filter input { width: 100%; font: inherit; font-size: .85rem; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); outline: none; }
.filter input:focus { border-color: var(--accent); }
.hit { padding: 4px 10px; font-size: .85rem; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
.hit:hover { background: var(--hover); }
.hit.active { background: var(--selected); }
.hit .m { color: var(--fg); font-weight: bold; text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 2px; }
.empty { padding: 8px 12px; font-size: .85rem; }
.side-resizer { flex: none; width: 4px; cursor: col-resize; margin-left: -2px; margin-right: -2px; z-index: 1; }
.side-resizer:hover { background: var(--accent); }
.main { flex: 1; min-width: 0; display: flex; }
</style>
