<script lang="scala">
// 右クリックメニュー(画面全体で1つ). ContextMenu.show で開く
case class Item(label: String, run: () => Unit)

val items = RV(List.empty[Item])
val pos = RV((0.0, 0.0))

def show(e: MouseEvent, xs: List[Item]): Unit = {
  e.preventDefault()
  pos := (e.clientX, e.clientY)
  items := xs
}

def close(): Unit = items := Nil

def pick(i: Item): Unit = {
  close()
  i.run()
}
</script>

<template>
  <div v-if="items.v.nonEmpty" class="overlay" @mousedown.self="close()" @contextmenu.prevent="close()">
    <ul class="menu" :style='s"left: ${pos.v._1}px; top: ${pos.v._2}px"'>
      <li v-for="i in items" @click="pick(i)">{{ i.label }}</li>
    </ul>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 1500; }
.menu { position: fixed; margin: 0; padding: 4px 0; list-style: none; min-width: 200px; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,.2); }
.menu li { padding: 5px 14px; cursor: pointer; white-space: nowrap; }
.menu li:hover { background: var(--selected); }
</style>
