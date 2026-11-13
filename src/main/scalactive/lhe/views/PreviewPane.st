<script lang="scala">
import lhe.*

// プレビューモード: 保存されたHTMLを、CSS・JSを読み込んだ状態で表示する
case class Props(path: String)

case class State(ver: RV[Int] = RV(0), var timer: Int = 0)

def initState() = State()

def mounted(s: State): Unit =
  // ワークスペース内のどれかが保存されたら、少し待って再読み込みする
  watch(Store.saved)((_, _) => {
    window.clearTimeout(s.timer)
    s.timer = window.setTimeout(() => s.ver := s.ver.v + 1, 500)
  })

def unmounted(s: State): Unit = window.clearTimeout(s.timer)

def src(path: String, ver: Int): String = s"${Host.fileUrl(path)}?v=$ver"
</script>

<template>
  <div class="preview">
    <div class="bar">
      <button title="再読み込み" @click="s.ver := s.ver.v + 1">⟳ 再読み込み</button>
    </div>
    <iframe :src="src(props.path, s.ver.v)"></iframe>
  </div>
</template>

<style scoped>
.preview { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.bar { flex: none; padding: 3px 6px; border-bottom: 1px solid var(--line); background: var(--bg); }
.bar button { font-size: .8rem; padding: 1px 8px; }
iframe { flex: 1; border: none; width: 100%; background: #fff; }
</style>
