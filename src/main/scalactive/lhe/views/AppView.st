<script lang="scala">
import lhe.Store
</script>

<template>
  <div class="app">
    <WorkspacePicker v-if="Store.workspace.v.isEmpty" />
    <Workbench v-else />
    <Dialogs />
    <ContextMenu />
    <div v-if="Store.toast.v.nonEmpty" class="toast" @click='Store.toast := ""' title="クリックで閉じる">{{ Store.toast }}</div>
  </div>
</template>

<style scoped>
.app { height: 100vh; display: flex; flex-direction: column; }
.toast { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); max-width: 80vw; background: #b42318; color: #fff; padding: 8px 14px; border-radius: 6px; cursor: pointer; z-index: 2000; white-space: pre-wrap; }
</style>
