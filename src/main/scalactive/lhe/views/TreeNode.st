<script lang="scala">
import lhe.{Entry, Host, Store}

// ツリーの1項目(ディレクトリなら子を再帰的に表示する)
case class Props(entry: Entry, depth: Int, onNewHtml: String => Unit, onNewDir: String => Unit)

def isOpen(e: Entry): Boolean = Store.expanded.v(e.path)

def isActive(e: Entry): Boolean = !e.dir && Store.activePane.exists(_.file.v.contains(e.path))

def isLayoutFile(e: Entry): Boolean = !e.dir && e.name.toLowerCase.matches("layout\\.html?")

def click(e: Entry): Unit = if (e.dir) Store.toggleDir(e.path) else Store.openFile(e.path)

/** HTMLを複製します(名前を聞いてから) */
def duplicate(path: String): Unit = {
  import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue
  Host.copyName(path).flatMap { def0 =>
    Dialogs.prompt("複製するHTMLファイルの名前(同じディレクトリに作ります)", def0.split('/').last)
  }.flatMap {
    case Some(name) if name.nonEmpty => Host.duplicateHtml(path, name).flatMap(p => Store.reloadTree().map(_ => Store.openFile(p)))
    case _ => scala.concurrent.Future.unit
  }.failed.foreach(Host.report)
}

def menu(props: Props, ev: MouseEvent): Unit = {
  val e = props.entry
  val common = List(ContextMenu.Item("Finderで表示", () => Host.reveal(e.path).failed.foreach(Host.report)(using scala.scalajs.concurrent.JSExecutionContext.queue)))
  val items =
    if (e.dir) List(
      ContextMenu.Item("この中に新しいHTMLファイル", () => props.onNewHtml(e.path)),
      ContextMenu.Item("この中に新しいディレクトリ", () => props.onNewDir(e.path)),
      ContextMenu.Item("この中に layout.html を作成", () => Store.createLayout(e.path))
    ) ++ common
    else List(
      ContextMenu.Item("開く", () => Store.openFile(e.path)),
      ContextMenu.Item("複製…", () => duplicate(e.path))
    ) ++ common
  ContextMenu.show(ev, items)
}
</script>

<template>
  <div>
    <div class="row" :class='Map("active" -> isActive(props.entry))' :style='s"padding-left: ${props.depth * 14 + 6}px"' @click="click(props.entry)" @contextmenu="menu(props, event.asInstanceOf[MouseEvent])" :title="props.entry.path">
      <span class="twisty">{{ if (!props.entry.dir) "" else if (isOpen(props.entry)) "▾" else "▸" }}</span>
      <span class="icon" :title='if (isLayoutFile(props.entry)) "レイアウト(同じディレクトリのページを囲む)" else ""'>{{ if (props.entry.dir) "📁" else if (isLayoutFile(props.entry)) "🧩" else "📄" }}</span>
      <span class="label">{{ props.entry.name }}</span>
      <span v-if="props.entry.dir" class="acts">
        <button title="この中に新しいHTMLファイル" @click.stop="props.onNewHtml(props.entry.path)">＋📄</button>
        <button title="この中に新しいディレクトリ" @click.stop="props.onNewDir(props.entry.path)">＋📁</button>
        <button title="この中に layout.html を作成(このディレクトリのページを囲むレイアウト)" @click.stop="Store.createLayout(props.entry.path)">＋🧩</button>
      </span>
    </div>
    <template v-if="props.entry.dir && isOpen(props.entry)">
      <TreeNode v-for="c in props.entry.children" :key="c.path" :entry="c" :depth="props.depth + 1" :onNewHtml="props.onNewHtml" :onNewDir="props.onNewDir" />
    </template>
  </div>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 4px; padding: 3px 6px; cursor: pointer; white-space: nowrap; font-size: .9rem; }
.row:hover { background: var(--hover); }
.row.active { background: var(--selected); }
.twisty { width: 12px; flex: none; color: var(--muted); font-size: .75rem; }
.icon { flex: none; font-size: .85rem; }
.label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.acts { display: none; flex: none; }
.row:hover .acts { display: inline-flex; }
.acts button { padding: 0 3px; font-size: .7rem; border: none; background: transparent; }
.acts button:hover { background: var(--line); }
</style>
