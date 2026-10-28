<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useProgressStore } from '@/entities/progress'
import { fetchLevel, findLevel, LEVEL_LABELS } from '@/entities/track'
import { QuizRunner } from '@/features/run-quiz'
import { QUIZ_STEP, ROUTE_NAMES } from '@/shared/config'

import LevelRail from './LevelRail.vue'

import type { Level } from '@/entities/track'

const { levelId, step } = defineProps<{ levelId: string; step: string }>()

const router = useRouter()
const progress = useProgressStore()

const summary = computed(() => findLevel(levelId))
const titles = computed(() => summary.value?.level.topicTitles ?? [])
const current = computed<number | typeof QUIZ_STEP>(() => (step === QUIZ_STEP ? QUIZ_STEP : Number(step)))

const level = ref<Level | null>(null)
const loading = ref(false)
const failed = ref(false)

const levelProgress = computed(() => progress.getLevel(levelId))
const seenCount = computed(() => Math.min(levelProgress.value.seenTopics.length, titles.value.length))
const percent = computed(() => (titles.value.length === 0 ? 0 : Math.round((seenCount.value / titles.value.length) * 100)))
const topic = computed(() => (typeof current.value === 'number' ? (level.value?.topics[current.value - 1] ?? null) : null))
const isLastTopic = computed(() => current.value === titles.value.length)

watch(() => levelId, load, { immediate: true })

watch(
  [() => levelId, current],
  ([id, value]) => {
    progress.setLastVisited({ levelId: id, step: value })
    if (typeof value === 'number') progress.markTopicSeen(id, value - 1)
  },
  { immediate: true },
)

async function load() {
  level.value = null
  failed.value = false
  loading.value = true
  const requested = levelId
  try {
    const loaded = await fetchLevel(requested)
    if (requested === levelId) level.value = loaded
  } catch {
    if (requested === levelId) failed.value = true
  } finally {
    if (requested === levelId) loading.value = false
  }
}

function goTo(target: number | typeof QUIZ_STEP) {
  return router.push({ name: ROUTE_NAMES.level, params: { levelId, step: String(target) } })
}

function nextTarget() {
  return isLastTopic.value ? QUIZ_STEP : Number(current.value) + 1
}
</script>

<template>
  <div v-if="summary" class="level-page">
    <header class="level-page__bar">
      <RouterLink class="level-page__back" :to="{ name: ROUTE_NAMES.home }">
        <i class="pi pi-arrow-left" aria-hidden="true" />
        Все треки
      </RouterLink>
      <div class="level-page__heading">
        <p class="level-page__eyebrow">{{ summary.track.title }}</p>
        <h1 class="level-page__title">{{ LEVEL_LABELS[summary.level.level] }}</h1>
      </div>
      <div class="level-page__progress">
        <span>Прочитано тем: {{ seenCount }} из {{ titles.length }}</span>
        <ProgressBar :value="percent" :show-value="false" aria-label="Прогресс по темам уровня" class="level-page__bar-fill" />
      </div>
    </header>

    <div class="level-page__layout">
      <LevelRail
        :level-id="levelId"
        :titles="titles"
        :seen-topics="levelProgress.seenTopics"
        :step="current"
        :quiz-passed="levelProgress.passedAt !== null"
      />

      <section class="lesson" aria-live="polite" :aria-busy="loading">
        <div v-if="loading" class="lesson__loading" role="status">
          <span class="visually-hidden">Загружаем уровень…</span>
          <Skeleton height="2rem" width="60%" />
          <Skeleton height="5rem" />
          <Skeleton height="8rem" />
        </div>

        <div v-else-if="failed" class="lesson__error">
          <Message severity="error">Не получилось загрузить уровень. Проверьте соединение и попробуйте ещё раз.</Message>
          <Button label="Повторить" icon="pi pi-refresh" severity="secondary" @click="load" />
        </div>

        <template v-else-if="level">
          <template v-if="current === QUIZ_STEP">
            <h2 class="lesson__title">Тест: {{ summary.track.title }}, {{ LEVEL_LABELS[summary.level.level] }}</h2>
            <QuizRunner :key="levelId" :level="level" @review-topic="goTo($event + 1)" />
            <nav class="lesson__nav" aria-label="Переход между шагами">
              <Button
                :label="`К теме ${titles.length}`"
                icon="pi pi-arrow-left"
                severity="secondary"
                variant="outlined"
                @click="goTo(titles.length)"
              />
            </nav>
          </template>

          <template v-else-if="topic">
            <h2 class="lesson__title">{{ current }}. {{ topic.title }}</h2>
            <!-- eslint-disable-next-line vue/no-v-html -- trusted HTML bundled with the app -->
            <article class="content" v-html="topic.html" />
            <nav class="lesson__nav" aria-label="Переход между шагами">
              <Button
                v-if="Number(current) > 1"
                label="Назад"
                icon="pi pi-arrow-left"
                severity="secondary"
                variant="outlined"
                @click="goTo(Number(current) - 1)"
              />
              <span v-else />
              <Button
                :label="isLastTopic ? 'К тесту' : 'Дальше'"
                :icon="isLastTopic ? 'pi pi-pencil' : 'pi pi-arrow-right'"
                icon-pos="right"
                @click="goTo(nextTarget())"
              />
            </nav>
          </template>
        </template>
      </section>
    </div>
  </div>
</template>

<style lang="sass" scoped>
@use './LevelPage'
</style>
