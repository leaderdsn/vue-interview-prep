<script setup lang="ts">
import { computed } from 'vue'

import { useProgressStore } from '@/entities/progress'
import { findLevel, LEVEL_LABELS, TRACKS } from '@/entities/track'
import { ManageProgress } from '@/features/manage-progress'
import { ROUTE_NAMES } from '@/shared/config'
import { TrackGrid } from '@/widgets/track-grid'

const progress = useProgressStore()

const levels = TRACKS.flatMap((track) => track.levels)
const totalTopics = levels.reduce((sum, level) => sum + level.topicTitles.length, 0)

const seenTopics = computed(() =>
  levels.reduce((sum, level) => sum + Math.min(progress.getLevel(level.id).seenTopics.length, level.topicTitles.length), 0),
)
const passedLevels = computed(() => levels.filter((level) => progress.getLevel(level.id).passedAt !== null).length)
const percent = computed(() => (totalTopics === 0 ? 0 : Math.round((seenTopics.value / totalTopics) * 100)))

const resume = computed(() => {
  const last = progress.lastVisited
  const found = last ? findLevel(last.levelId) : null
  if (!last || !found) return null
  return {
    to: { name: ROUTE_NAMES.level, params: { levelId: last.levelId, step: String(last.step) } },
    label: `${found.track.title} · ${LEVEL_LABELS[found.level.level]}`,
  }
})
</script>

<template>
  <div class="home-page">
    <section class="home-page__hero" aria-labelledby="home-title">
      <div class="home-page__intro">
        <h1 id="home-title" class="home-page__title">Готовимся к собеседованию</h1>
        <p class="home-page__lead">Короткие темы, тесты на 12 вопросов и сохранённый прогресс. Выберите трек и уровень.</p>
      </div>

      <div class="home-page__progress">
        <p class="home-page__stats">
          <strong>{{ seenTopics }}</strong> из {{ totalTopics }} тем изучено ·
          <strong>{{ passedLevels }}</strong> из {{ levels.length }} уровней сдано
        </p>
        <ProgressBar :value="percent" :show-value="false" aria-label="Общий прогресс по темам" class="home-page__bar" />
        <RouterLink v-if="resume" v-slot="{ navigate, href }" :to="resume.to" custom>
          <Button as="a" :href="href" icon="pi pi-play" :label="`Продолжить: ${resume.label}`" @click="navigate" />
        </RouterLink>
      </div>
    </section>

    <TrackGrid />

    <section class="home-page__manage" aria-labelledby="manage-title">
      <h2 id="manage-title" class="home-page__subtitle">Мой прогресс</h2>
      <p class="home-page__hint">Он хранится в этом браузере. Сохраните файл, чтобы перенести его на другое устройство.</p>
      <ManageProgress />
    </section>
  </div>
</template>

<style lang="sass" scoped>
@use './HomePage'
</style>
