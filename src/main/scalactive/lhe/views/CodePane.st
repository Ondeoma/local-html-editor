<script lang="scala">
import lhe.*

import scala.scalajs.js
import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue

// CSS・JS・ソースモード: シンタックスハイライト付きのテキストエディタ(js/code.js). readOnly はHTMLのソース表示
case class Props(path: String, lang: String, paneId: Int, readOnly: Boolean = false)

case class State(host: ElementRef[HTMLElement] = ElementRef(),
                 exists: RV[Boolean] = RV(true),
                 var ed: Option[CodeHandle] = None,
                 var saver: Option[Saver[String]] = None,
                 var timer: Int = 0)

def initState() = State()

def mounted(props: Props, s: State): Unit = {
  val saver = new Saver[String](400)(text =>
    Host.writeText(props.path, text).map { _ =>
      if (text.nonEmpty) s.exists := true
      Store.notifySaved(props.path, text, props.paneId)
    })
  s.saver = Some(saver)
  Host.readText(props.path).foreach { text =>
    s.exists := text.isDefined
    s.host.foreach { el =>
      s.ed = Some(Host.createCodeEditor(el, js.Dynamic.literal(
        text = text.getOrElse(""),
        lang = props.lang,
        readOnly = props.readOnly,
        onChange = ((t: String) => saver.schedule(t)): js.Function1[String, Unit]
      )))
    }
  }
  watch(Store.saved)((_, v) => v.foreach { sv =>
    if (props.readOnly) {
      // ソース表示: 保存のたびに(CSS・JSの追加で head が変わることもあるので、どの保存でも)読み直す
      window.clearTimeout(s.timer)
      s.timer = window.setTimeout(() => Host.readText(props.path).foreach(t => s.ed.foreach(_.setText(t.getOrElse("")))), 300)
    } else if (sv.path == props.path && sv.source != props.paneId) s.ed.foreach(_.setText(sv.content))
  })
}

def unmounted(s: State): Unit = {
  window.clearTimeout(s.timer)
  s.saver.foreach(_.flush())
  s.ed.foreach(_.destroy())
  s.ed = None
}
</script>

<template>
  <div class="code">
    <p v-if="props.readOnly" class="note">保存されたHTMLのソースです(読み取り専用)。編集は「編集」モードで行います。</p>
    <p v-else-if="!s.exists.v" class="note">{{ props.path }} はまだありません。入力すると作成され、対象のHTMLから読み込まれるようになります。</p>
    <div class="host" ref="s.host"></div>
  </div>
</template>

<style scoped>
.code { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.note { margin: 0; padding: 6px 10px; font-size: .8rem; background: var(--side); color: var(--muted); border-bottom: 1px solid var(--line); }
.host { flex: 1; min-height: 0; overflow: hidden; }
</style>
