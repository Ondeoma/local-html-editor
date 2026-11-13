<script lang="scala">
import lhe.{Mode, PaneState, Store}

// 1つの表示領域: モードの切り替えと分割・閉じるボタン、中身のエディタ
case class Props(pane: PaneState)

def target(p: PaneState): String = p.file.v.map(p.mode.v.target).getOrElse("(ファイル未選択)")

case class State(over: RV[Boolean] = RV(false))

def initState() = State()

def dragStart(p: PaneState, e: DragEvent): Unit = {
  e.dataTransfer.setData("text/plain", s"lhe-pane:${p.id}")
  e.dataTransfer.effectAllowed = DataTransferEffectAllowedKind.move
  Store.dragging := Some(p.id)
}

def dragOver(p: PaneState, s: State, e: DragEvent): Unit =
  if (Store.dragging.v.exists(_ != p.id)) {
    e.preventDefault()
    s.over := true
  }

def drop(p: PaneState, s: State, e: DragEvent): Unit = {
  s.over := false
  Store.dragging.v.foreach { from =>
    e.preventDefault()
    Store.swap(from, p.id)
  }
  Store.dragging := None
}
</script>

<template>
  <div class="pane" :class='Map("active" -> (Store.active.v == props.pane.id && Store.paneCount > 1), "drop" -> s.over.v)' @mousedown.capture="Store.active := props.pane.id"
       @dragover="dragOver(props.pane, s, event.asInstanceOf[DragEvent])" @dragleave.self="s.over := false" @drop="drop(props.pane, s, event.asInstanceOf[DragEvent])">
    <div class="pane-head">
      <span v-if="Store.paneCount > 1" class="grip" draggable="true" title="ドラッグして他の領域と入れ替え"
            @dragstart="dragStart(props.pane, event.asInstanceOf[DragEvent])" @dragend="Store.dragging := None">⠿</span>
      <span class="modes">
        <button v-for="m in Mode.values.toList" :title="m.desc" :class='Map("on" -> (props.pane.mode.v == m))' @click="props.pane.mode := m">{{ m.label }}</button>
      </span>
      <span class="acts">
        <template v-if="Store.paneCount < Store.MaxPanes">
          <button title="左右に分割" @click="Store.split(props.pane.id, false)">◫</button>
          <button title="上下に分割" @click="Store.split(props.pane.id, true)">⊟</button>
        </template>
        <button v-if="Store.paneCount > 1" title="この領域を閉じる" @click="Store.closePane(props.pane.id)">✕</button>
      </span>
    </div>
    <div class="file" :title="target(props.pane)">{{ target(props.pane) }}</div>
    <div class="pane-body">
      <p v-if="props.pane.file.v.isEmpty" class="placeholder muted">左のツリーからHTMLファイルを選んでください</p>
      <WysiwygPane v-else-if="props.pane.mode.v == Mode.Html" :path="props.pane.file.v.get" :paneId="props.pane.id" />
      <PreviewPane v-else-if="props.pane.mode.v == Mode.Preview" :path="props.pane.file.v.get" />
      <CodePane v-else :path="props.pane.mode.v.target(props.pane.file.v.get)" :lang="props.pane.mode.v.lang" :paneId="props.pane.id" :readOnly="props.pane.mode.v == Mode.Source" />
    </div>
  </div>
</template>

<style scoped>
.pane { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; border: 2px solid transparent; }
.pane.active { border-color: var(--accent-soft); }
.pane.drop { border-color: var(--accent); background: var(--selected); }
.grip { cursor: grab; color: var(--muted); padding: 0 2px; user-select: none; }
.grip:active { cursor: grabbing; }
.pane-head { flex: none; display: flex; align-items: center; gap: 6px; padding: 4px 6px 2px; background: var(--side); }
.modes { display: flex; flex: 0 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; border: 1px solid var(--line); border-radius: 6px; }
.modes button { flex: none; white-space: nowrap; }
.modes button { border: none; border-radius: 0; padding: 3px 8px; font-size: .8rem; background: var(--bg); }
.modes button + button { border-left: 1px solid var(--line); }
.modes button.on { background: var(--accent); color: #fff; }
.file { flex: none; padding: 0 8px 3px; font-size: .75rem; color: var(--muted); background: var(--side); border-bottom: 1px solid var(--line); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.acts { flex: none; display: inline-flex; gap: 2px; margin-left: auto; }
.acts button { padding: 2px 6px; font-size: .85rem; border: none; background: transparent; }
.acts button:hover { background: var(--hover); }
.pane-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.placeholder { margin: auto; }
</style>
