<script lang="scala">
import lhe.{Host, Store}

import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue

// 起動直後の画面: ワークスペース(編集するディレクトリ)を選ぶ
case class State(recent: RV[List[String]] = RV(Nil))

def initState() = State()

def mounted(s: State): Unit = Host.recentList().foreach(s.recent := _)

def choose(): Unit = Host.pickDirectory().foreach(_.foreach(Store.open))

def remove(s: State, p: String): Unit = Host.recentRemove(p).foreach(_ => s.recent := s.recent.v.filterNot(_ == p))

def name(p: String): String = p.split("[/\\\\]").filter(_.nonEmpty).lastOption.getOrElse(p)
</script>

<template>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <div>
          <h1>ローカルHTMLエディタ</h1>
          <p class="muted">編集するディレクトリ(ワークスペース)を選んでください</p>
        </div>
        <button class="primary" @click="choose()">📂 選択…</button>
      </div>
      <template v-if="s.recent.v.nonEmpty">
        <h2>最近開いたワークスペース</h2>
        <ul class="recent">
          <li v-for="p in s.recent" :key="p">
            <button class="open" :title="p" @click="Store.open(p)"><span class="name">{{ name(p) }}</span><span class="path"><bdi>{{ p }}</bdi></span></button>
            <button class="rm" title="一覧から外す" @click="remove(s, p)">×</button>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; }
.card { width: min(520px, 100%); background: var(--side); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; box-shadow: 0 4px 16px rgba(0,0,0,.08); }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h1 { font-size: 1.15rem; margin: 0; }
.head p { margin: 2px 0 0; font-size: .8rem; }
.head button { flex: none; }
h2 { font-size: .75rem; margin: 14px 0 6px; color: var(--muted); font-weight: normal; }
.recent { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; max-height: 50vh; overflow: auto; }
.recent li { display: flex; align-items: stretch; border-radius: 6px; }
.recent li:hover { background: var(--hover); }
.open { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 5px 8px; border: none; background: transparent; }
.open:hover { background: transparent; }
.name { font-weight: bold; font-size: .9rem; }
.path { font-size: .72rem; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; }
.rm { flex: none; width: 28px; padding: 0; border: none; background: transparent; color: var(--muted); visibility: hidden; }
.recent li:hover .rm { visibility: visible; }
</style>
