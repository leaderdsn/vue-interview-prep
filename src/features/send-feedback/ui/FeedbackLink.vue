<script setup lang="ts">
import { useFeedbackStore } from '../model/feedbackStore'

import type { FeedbackContext, FeedbackKind } from '@/entities/feedback'

const {
  kind,
  label,
  context = {},
  icon = 'pi pi-flag',
  plain = false,
} = defineProps<{
  /** Тип, который будет выбран в форме. */
  kind: FeedbackKind
  label: string
  /** Где оставлено замечание; страница подставляется сама. */
  context?: Partial<FeedbackContext>
  icon?: string
  /** Простая кнопка без оформления PrimeVue (например, в подвале среди ссылок). */
  plain?: boolean
}>()

const feedback = useFeedbackStore()

function open() {
  feedback.open(kind, context)
}
</script>

<template>
  <template v-if="feedback.available">
    <button v-if="plain" type="button" class="feedback-link" aria-haspopup="dialog" @click="open">{{ label }}</button>
    <Button
      v-else
      :label="label"
      :icon="icon"
      severity="secondary"
      variant="text"
      size="small"
      aria-haspopup="dialog"
      @click="open"
    />
  </template>
</template>

<style lang="sass" scoped>
@use './FeedbackLink'
</style>
