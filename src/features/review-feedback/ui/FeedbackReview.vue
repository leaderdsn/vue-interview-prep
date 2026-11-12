<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { FILTER_LABELS, FILTERS, useReviewStore } from '../model/reviewStore'

import FeedbackCard from './FeedbackCard.vue'

import type { EditorTarget } from '../model/target'

const emit = defineEmits<{
  'open-editor': [target: EditorTarget]
}>()

const review = useReviewStore()

const filterOptions = computed(() =>
  FILTERS.map((value) => ({ value, label: `${FILTER_LABELS[value]} · ${review.counts[value]}` })),
)

onMounted(() => {
  if (!review.loaded && !review.loading) void review.load()
})
</script>

<template>
  <section class="feedback-review" aria-label="Отзывы пользователей" :aria-busy="review.loading">
    <div class="feedback-review__toolbar">
      <SelectButton
        v-model="review.filter"
        :options="filterOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-label="Статус отзывов"
      />
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        variant="text"
        size="small"
        :loading="review.loading"
        @click="review.load()"
      />
    </div>

    <Message v-if="review.error" severity="error" size="small" closable @close="review.error = null">{{ review.error }}</Message>

    <div v-if="review.loading && !review.loaded" role="status">
      <span class="visually-hidden">Загружаем отзывы…</span>
      <Skeleton height="8rem" />
    </div>
    <p v-else-if="!review.visible.length" class="feedback-review__empty">
      {{ review.filter === 'all' ? 'Отзывов пока нет' : `Нет отзывов со статусом «${FILTER_LABELS[review.filter]}»` }}
    </p>
    <div v-else class="feedback-review__list">
      <FeedbackCard v-for="item in review.visible" :key="item.id" :item="item" @open-editor="emit('open-editor', $event)" />
    </div>
  </section>
</template>

<style lang="sass" scoped>
@use './FeedbackReview'
</style>
