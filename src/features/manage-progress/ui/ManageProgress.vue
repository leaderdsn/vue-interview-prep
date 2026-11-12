<script setup lang="ts">
import { ref } from 'vue'

import { useProgressStore } from '@/entities/progress'
import { downloadFile } from '@/shared/lib'

const progress = useProgressStore()

const fileInput = ref<HTMLInputElement | null>(null)
const confirmDialog = ref<HTMLDialogElement | null>(null)
const status = ref<{ severity: 'success' | 'error'; text: string } | null>(null)

function exportProgress() {
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(`interview-prep-progress-${date}.json`, progress.exportJson())
}

async function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    progress.importJson(await file.text())
    status.value = { severity: 'success', text: 'Прогресс загружен' }
  } catch (error) {
    status.value = {
      severity: 'error',
      text: error instanceof Error ? error.message : 'Не удалось прочитать файл',
    }
  }
}

function askReset() {
  confirmDialog.value?.showModal()
}

function closeDialog() {
  confirmDialog.value?.close()
}

function confirmReset() {
  progress.resetAll()
  status.value = { severity: 'success', text: 'Прогресс сброшен' }
  closeDialog()
}
</script>

<template>
  <div class="manage-progress">
    <div class="manage-progress__actions">
      <Button label="Экспорт" icon="pi pi-download" severity="secondary" variant="outlined" size="small" @click="exportProgress" />
      <Button label="Импорт" icon="pi pi-upload" severity="secondary" variant="outlined" size="small" @click="fileInput?.click()" />
      <Button label="Сбросить всё" icon="pi pi-trash" severity="danger" variant="text" size="small" @click="askReset" />
      <input
        ref="fileInput"
        class="manage-progress__file"
        type="file"
        accept="application/json,.json"
        aria-label="Файл с прогрессом"
        tabindex="-1"
        @change="onFileChosen"
      >
    </div>

    <Message v-if="status" :severity="status.severity" size="small" closable role="status" @close="status = null">
      {{ status.text }}
    </Message>

    <dialog ref="confirmDialog" class="manage-progress__dialog" aria-labelledby="reset-title">
      <h2 id="reset-title" class="manage-progress__dialog-title">Сбросить весь прогресс?</h2>
      <p class="manage-progress__dialog-text">Прочитанные темы и результаты тестов будут удалены. Это нельзя отменить.</p>
      <div class="manage-progress__dialog-actions">
        <Button label="Отмена" severity="secondary" variant="text" @click="closeDialog" />
        <Button label="Сбросить" severity="danger" @click="confirmReset" />
      </div>
    </dialog>
  </div>
</template>

<style lang="sass" scoped>
@use './ManageProgress'
</style>
