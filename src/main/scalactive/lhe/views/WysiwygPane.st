<script lang="scala">
import lhe.*

import scala.scalajs.js
import scala.scalajs.js.JSConverters.*
import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue

// HTMLモード: ツールバーと WYSIWYG エディタ(js/wysiwyg.js)
case class Props(path: String, paneId: Int)

/** ツールバーに出す、カーソル位置の状態 */
case class Tb(heading: Int = 0, bold: Boolean = false, italic: Boolean = false, strike: Boolean = false, underline: Boolean = false,
              code: Boolean = false, link: Boolean = false, bulletList: Boolean = false, orderedList: Boolean = false,
              blockquote: Boolean = false, codeBlock: Boolean = false, table: Boolean = false, panel: Boolean = false,
              media: Boolean = false, align: String = "left", color: String = "")

object Tb {
  def from(d: js.Dynamic): Tb = {
    def b(k: String) = d.selectDynamic(k).asInstanceOf[Boolean]
    Tb(d.heading.asInstanceOf[Int], b("bold"), b("italic"), b("strike"), b("underline"), b("code"), b("link"), b("bulletList"),
      b("orderedList"), b("blockquote"), b("codeBlock"), b("table"), b("panel"), b("media"), d.align.asInstanceOf[String], d.color.asInstanceOf[String])
  }
}

case class State(host: ElementRef[HTMLElement] = ElementRef(),
                 tb: RV[Tb] = RV(Tb()),
                 loading: RV[Boolean] = RV(true),
                 hsel: RV[String] = RV("0"),
                 var ed: Option[WysiwygHandle] = None,
                 var saver: Option[Saver[(String, String)]] = None)

def initState() = State()

/** 埋め込み・リンクの候補: ワークスペースの全HTML(このHTMLからの相対パス) */
def pages(path: String): js.Array[String] = {
  Store.allHtml.filterNot(_ == path).map(Paths.relative(Paths.dirOf(path), _)).toJSArray
}

def mounted(props: Props, s: State): Unit = {
  val stem = Paths.split(props.path)._2
  val saver = new Saver[(String, String)](400)({ case (content, title) =>
    Host.saveHtml(props.path, if (title.nonEmpty) title else stem, content).map(_ => Store.notifySaved(props.path, content, props.paneId))
  })
  s.saver = Some(saver)
  Host.loadHtml(props.path).foreach { html =>
    s.loading := false
    s.host.foreach { el =>
      s.ed = Some(Host.createWysiwyg(el, js.Dynamic.literal(
        htmlPath = props.path,
        html = html,
        onChange = ((content: String, title: String) => saver.schedule((content, title))): js.Function2[String, String, Unit],
        onState = ((d: js.Dynamic) => {
          val tb = Tb.from(d)
          s.tb := tb
          s.hsel := tb.heading.toString
        }): js.Function1[js.Dynamic, Unit],
        pages = (() => pages(props.path)): js.Function0[js.Array[String]]
      )))
    }
  }
  // 同じHTMLを開いている他の領域で保存されたら、内容を差し替える
  watch(Store.saved)((_, v) => v.foreach { sv =>
    if (sv.path == props.path && sv.source != props.paneId) s.ed.foreach(_.setContent(sv.content))
  })
}

def unmounted(s: State): Unit = {
  s.saver.foreach(_.flush())
  s.ed.foreach(_.destroy())
  s.ed = None
}

def exec(s: State, name: String, arg: js.Any = js.undefined): Unit = s.ed.foreach(_.exec(name, arg))

def isLayout(path: String): Boolean = Paths.split(path)._2 == "layout"

def inputValue(e: Event): String = e.target.asInstanceOf[HTMLInputElement].value

val headings = List(0 -> "本文", 1 -> "見出し1", 2 -> "見出し2", 3 -> "見出し3", 4 -> "見出し4")
val aligns = List(("left", "⇤", "左寄せ"), ("center", "↔", "中央寄せ"), ("right", "⇥", "右寄せ"))
</script>

<template>
  <div class="wys">
    <div class="toolbar">
      <span class="grp">
        <button title="元に戻す (⌘Z)" @click='exec(s, "undo")'>↶</button>
        <button title="やり直す (⇧⌘Z)" @click='exec(s, "redo")'>↷</button>
      </span>
      <span class="grp">
        <select title="段落の種類" v-model="s.hsel" @change='exec(s, "heading", event.target.asInstanceOf[HTMLSelectElement].value.toInt)'>
          <option v-for="h in headings" :value="h._1.toString">{{ h._2 }}</option>
        </select>
      </span>
      <span class="grp">
        <button class="b" title="太字 (⌘B)" :class='Map("on" -> s.tb.v.bold)' @click='exec(s, "bold")'>B</button>
        <button class="i" title="斜体 (⌘I)" :class='Map("on" -> s.tb.v.italic)' @click='exec(s, "italic")'>I</button>
        <button class="u" title="下線 (⌘U)" :class='Map("on" -> s.tb.v.underline)' @click='exec(s, "underline")'>U</button>
        <button class="st" title="取り消し線" :class='Map("on" -> s.tb.v.strike)' @click='exec(s, "strike")'>S</button>
        <label class="color" title="文字色"><span :style='s"border-bottom: 3px solid ${if (s.tb.v.color.nonEmpty) s.tb.v.color else "#000"}"'>A</span><input type="color" @change='exec(s, "color", inputValue(event))'></label>
        <button title="文字色を解除" @click='exec(s, "color", "")'>A̸</button>
      </span>
      <span class="grp">
        <button v-for="a in aligns" :title="a._3" :class='Map("on" -> (s.tb.v.align == a._1))' @click='exec(s, "align", a._1)'>{{ a._2 }}</button>
      </span>
      <span class="grp">
        <button title="箇条書き" :class='Map("on" -> s.tb.v.bulletList)' @click='exec(s, "bulletList")'>•≡</button>
        <button title="番号付きリスト" :class='Map("on" -> s.tb.v.orderedList)' @click='exec(s, "orderedList")'>1.≡</button>
        <button title="引用" :class='Map("on" -> s.tb.v.blockquote)' @click='exec(s, "blockquote")'>❝</button>
        <button title="コード(文中)" :class='Map("on" -> s.tb.v.code)' @click='exec(s, "code")'>&lt;&gt;</button>
        <button title="コードブロック" :class='Map("on" -> s.tb.v.codeBlock)' @click='exec(s, "codeBlock")'>{ }</button>
        <button title="水平線" @click='exec(s, "hr")'>―</button>
        <button title="リンク" :class='Map("on" -> s.tb.v.link)' @click='exec(s, "link")'>🔗</button>
      </span>
      <span class="grp">
        <button title="表(選択すると近くに表のメニューが出ます)" @click='exec(s, "table")'>▦</button>
        <button title="画像" @click='exec(s, "image")'>🖼</button>
        <button title="動画" @click='exec(s, "video")'>🎬</button>
        <button title="ファイル" @click='exec(s, "file")'>📎</button>
        <button title="他ページの埋め込み" @click='exec(s, "embed")'>⧉</button>
        <button title="目次" @click='exec(s, "toc")'>☰</button>
        <button title="Mermaid図" @click='exec(s, "mermaid")'>◇</button>
        <button v-if="isLayout(props.path)" title="コンテンツ枠(同じディレクトリの各ページの本文が入る場所)" @click='exec(s, "slot")'>📄枠</button>
      </span>
      <span class="grp">
        <button v-for="p in Host.panelPresets" :title='s"${p._2}パネル"' @click='exec(s, "panel", p._1)'>{{ p._3 }}</button>
      </span>
    </div>
    <div v-if="s.tb.v.panel" class="toolbar sub">
      <span class="lbl">パネル:</span>
      <label class="color" title="パネルの背景色">背景色<input type="color" @change='exec(s, "panelColor", inputValue(event))'></label>
      <span class="muted hint">アイコンはクリックで変更できます</span>
      <button @click='exec(s, "unpanel")'>パネルを解除</button>
    </div>
    <p v-if="s.loading.v" class="muted loading">読み込み中…</p>
    <div class="editor lhe-content" ref="s.host"></div>
  </div>
</template>

<style scoped>
.wys { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.toolbar { flex: none; display: flex; flex-wrap: wrap; gap: 4px 8px; padding: 4px 6px; border-bottom: 1px solid var(--line); background: var(--bg); }
.toolbar.sub { background: var(--side); font-size: .85rem; align-items: center; gap: 4px; }
.grp { display: inline-flex; gap: 1px; }
.toolbar select { font: inherit; font-size: .85rem; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 4px; padding: 1px 4px; }
.toolbar button { min-width: 26px; padding: 2px 6px; border: 1px solid transparent; background: transparent; font-size: .85rem; }
.toolbar button:hover { background: var(--hover); }
.toolbar button.on { background: var(--selected); border-color: var(--accent-soft); }
.toolbar.sub button { border-color: var(--line); background: var(--bg); }
.b { font-weight: bold; } .i { font-style: italic; } .u { text-decoration: underline; } .st { text-decoration: line-through; }
.color { position: relative; display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; cursor: pointer; border-radius: 4px; }
.color:hover { background: var(--hover); }
.color input { width: 22px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; }
.lbl { font-weight: bold; }
.hint { font-size: .8rem; }
.danger { color: #b42318; }
.loading { padding: 12px; }
.editor { flex: 1; overflow: auto; padding: 16px 24px; }
</style>
