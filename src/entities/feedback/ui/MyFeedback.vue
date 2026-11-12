<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { fetchMyFeedback } from '../api/feedbackApi'
import { FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_LABELS } from '../config/feedback'
import { describeContext } from '../lib/report'

import type { FeedbackItem } from '../model/types'

const { uid, limit = 10 } = defineProps<{
  uid: string
  /** Сколько последних замечаний показывать. */
  limit?: number
}>()

const items = ref<FeedbackItem[]>([])
const loading = ref(true)
const failed = ref(false)

const formatDate = (time: number) => new Date(time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const shorten = (text: string) => (text.length > 120 ? `${text.slice(0, 119).trimEnd()}…` : text)

// Список грузится при каждом открытии: компонент монтируется, только когда его раскрыли.
onMounted(async () => {
  try {
    items.value = (await fetchMyFeedback(uid)).slice(0, limit)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="my-feedback" :aria-busy="loading">
    <p v-if="loading" class="my-feedback__note" role="status">Загружаем…</p>
    <p v-else-if="failed" class="my-feedback__note" role="alert">Не удалось загрузить замечания</p>
    <p v-else-if="!items.length" class="my-feedback__note">Вы ещё не отправляли замечаний</p>
    <ul v-else class="my-feedback__list">
      <li v-for="item in items" :key="item.id" class="my-feedback__item">
        <span class="my-feedback__meta">
          {{ FEEDBACK_KIND_LABELS[item.kind] }} · {{ formatDate(item.createdAt) }}
          <span class="my-feedback__status" :class="`my-feedback__status--${item.status}`">
            {{ FEEDBACK_STATUS_LABELS[item.status] }}
          </span>
        </span>
        <span class="my-feedback__text">{{ shorten(item.text) }}</span>
        <span class="my-feedback__where">{{ describeContext(item) }}</span>
      </li>
    </ul>
  </div>
</template>

<style lang="sass" scoped>
@use './MyFeedback'
</style>
