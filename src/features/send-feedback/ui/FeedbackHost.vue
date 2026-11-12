<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import { useFeedbackStore } from '../model/feedbackStore'

// Форма с Dialog и вызовами Firebase — отдельный чанк: он грузится, только когда форму открыли.
const FeedbackForm = defineAsyncComponent(() => import('./FeedbackForm.vue'))

const feedback = useFeedbackStore()
</script>

<template>
  <FeedbackForm v-if="feedback.requested" />
  <p class="feedback-notice" role="status" aria-live="polite">
    <span v-if="feedback.notice" class="feedback-notice__text">
      <i class="pi pi-check-circle" aria-hidden="true" />
      {{ feedback.notice }}
    </span>
  </p>
</template>

<style lang="sass" scoped>
@use './FeedbackHost'
</style>
