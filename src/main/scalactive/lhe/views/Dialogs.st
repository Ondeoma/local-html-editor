<script lang="scala">
import scala.concurrent.{Future, Promise}
import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue

// 入力ダイアログ(画面全体で1つ). Dialogs.prompt で開く
val open = RV(false)
val title = RV("")
val value = RV("")
val suggestions = RV(List.empty[String])
private var pending: Option[Promise[Option[String]]] = None

case class State(input: ElementRef[HTMLInputElement] = ElementRef())

def initState() = State()

/** 文字列を入力してもらいます(キャンセルなら None) */
def prompt(t: String, v: String = "", sug: List[String] = Nil): Future[Option[String]] = {
  pending.foreach(_.trySuccess(None))
  val p = Promise[Option[String]]()
  pending = Some(p)
  title := t
  value := v
  suggestions := sug
  open := true
  p.future
}

def finish(r: Option[String]): Unit = {
  open := false
  pending.foreach(_.trySuccess(r))
  pending = None
}

def mounted(s: State): Unit =
  watch(open)((_, o) => if (o) nextTick().foreach(_ => s.input.foreach { i => i.focus(); i.select() }))
</script>

<template>
  <div v-if="open.v" class="overlay" @mousedown.self="finish(None)">
    <form class="dialog" @submit.prevent="finish(Some(value.v.trim))">
      <label>{{ title }}</label>
      <input type="text" ref="s.input" v-model="value" list="lhe-suggestions" @keydown.esc="finish(None)">
      <datalist id="lhe-suggestions">
        <option v-for="x in suggestions" :value="x"></option>
      </datalist>
      <div class="buttons">
        <button type="button" @click="finish(None)">キャンセル</button>
        <button type="submit" class="primary">決定</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.3); display: flex; align-items: flex-start; justify-content: center; padding-top: 18vh; z-index: 1000; }
.dialog { background: var(--bg); color: var(--fg); border-radius: 8px; padding: 16px; width: min(520px, 90vw); box-shadow: 0 10px 30px rgba(0,0,0,.25); display: flex; flex-direction: column; gap: 10px; }
.dialog input { padding: 6px 8px; font: inherit; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
.buttons { display: flex; justify-content: flex-end; gap: 8px; }
</style>
