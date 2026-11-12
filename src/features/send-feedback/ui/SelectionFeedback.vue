<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { floatingPosition, isReportShortcut, selectionQuoteIn } from '../lib/selection'
import { useFeedbackStore } from '../model/feedbackStore'

import type { FeedbackContext } from '@/entities/feedback'

const { target, context } = defineProps<{
  /** Статья темы: кнопка появляется только для выделения внутри неё. */
  target: HTMLElement | null
  /** Контекст замечания без страницы и цитаты (их добавят сами). */
  context: Omit<FeedbackContext, 'page' | 'quote'>
}>()

const feedback = useFeedbackStore()

const quote = ref<string | null>(null)
const position = ref<{ top: number; left: number } | null>(null)
/**
 * Цитата, запомненная при нажатии на кнопку: на сенсорных экранах касание может снять выделение
 * раньше, чем придёт click.
 */
let held: string | null = null
let frame = 0

function update() {
  frame = 0
  const selection = document.getSelection()
  const text = selectionQuoteIn(selection, target)
  if (!text || !selection) {
    // Пока кнопку нажимают, она не прячется, даже если выделение уже снято.
    if (held) return
    quote.value = null
    position.value = null
    return
  }
  const rect = selection.getRangeAt(selection.rangeCount - 1).getBoundingClientRect()
  quote.value = text
  position.value = floatingPosition(rect, { width: window.innerWidth, height: window.innerHeight })
}

/** Пересчёт не чаще раза за кадр: selectionchange и scroll приходят пачками. */
function schedule() {
  if (!frame) frame = requestAnimationFrame(update)
}

function report(text: string) {
  feedback.open('typo', { ...context, quote: text })
}

function hold() {
  held = quote.value
}

function release() {
  held = null
  schedule()
}

function onClick() {
  const text = held ?? quote.value
  held = null
  if (text) report(text)
}

function onKeydown(event: KeyboardEvent) {
  if (!isReportShortcut(event)) return
  const text = selectionQuoteIn(document.getSelection(), target)
  if (!text) return
  event.preventDefault()
  report(text)
}

onMounted(() => {
  document.addEventListener('selectionchange', schedule)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', schedule, { passive: true, capture: true })
  window.addEventListener('resize', schedule, { passive: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', schedule)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', schedule, { capture: true })
  window.removeEventListener('resize', schedule)
  if (frame) cancelAnimationFrame(frame)
})

defineExpose({ update })
</script>

<template>
  <!-- mousedown.prevent: щелчок по кнопке не снимает выделение и не мешает копированию -->
  <button
    v-if="feedback.available && quote && position"
    type="button"
    class="selection-feedback"
    :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    title="Сообщить об ошибке в выделенном тексте (Ctrl+Enter)"
    aria-keyshortcuts="Control+Enter Meta+Enter"
    @mousedown.prevent
    @pointerdown="hold"
    @pointercancel="release"
    @click="onClick"
  >
    <i class="pi pi-flag" aria-hidden="true" />
    Сообщить об ошибке
  </button>
</template>

<style lang="sass" scoped>
@use './SelectionFeedback'
</style>
