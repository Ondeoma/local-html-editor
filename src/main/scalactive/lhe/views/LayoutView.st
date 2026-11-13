<script lang="scala">
import lhe.{Drag, Layout}

// 右側の領域の分割を再帰的に表示する
case class Props(layout: Layout)

case class State(box: ElementRef[HTMLElement] = ElementRef())

def initState() = State()

def sp(l: Layout): Layout.Split = l.asInstanceOf[Layout.Split]

def drag(sp: Layout.Split, s: State, e: MouseEvent): Unit = {
  e.preventDefault()
  s.box.foreach { box =>
    val r = box.getBoundingClientRect()
    Drag.start { ev =>
      val v = if (sp.vertical) (ev.clientY - r.top) / r.height else (ev.clientX - r.left) / r.width
      sp.ratio := math.max(0.1, math.min(0.9, v))
    }
  }
}
</script>

<template>
  <PaneView v-if="props.layout.isInstanceOf[Layout.Leaf]" :pane="props.layout.panes.head" />
  <div v-else class="split" :class='if (sp(props.layout).vertical) "v" else "h"' ref="s.box">
    <div class="part" :style='s"flex: ${sp(props.layout).ratio.v} 1 0%"'><LayoutView :layout="sp(props.layout).a" /></div>
    <div class="divider" @mousedown="drag(sp(props.layout), s, event.asInstanceOf[MouseEvent])"></div>
    <div class="part" :style='s"flex: ${1 - sp(props.layout).ratio.v} 1 0%"'><LayoutView :layout="sp(props.layout).b" /></div>
  </div>
</template>

<style scoped>
.split { flex: 1; display: flex; min-width: 0; min-height: 0; }
.split.v { flex-direction: column; }
.part { display: flex; min-width: 0; min-height: 0; overflow: hidden; }
.divider { flex: none; background: var(--line); }
.split.h > .divider { width: 4px; cursor: col-resize; }
.split.v > .divider { height: 4px; cursor: row-resize; }
.divider:hover { background: var(--accent); }
</style>
