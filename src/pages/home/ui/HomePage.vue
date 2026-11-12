<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useProgressStore } from '@/entities/progress'
import { findLevel, LEVEL_LABELS, TRACK_CATEGORIES, TRACKS } from '@/entities/track'
import { ManageProgress } from '@/features/manage-progress'
import { ROUTE_NAMES } from '@/shared/config'
import { TrackGrid } from '@/widgets/track-grid'

import type { TrackCategory } from '@/entities/track'

const progress = useProgressStore()
const route = useRoute()
const router = useRouter()

type CategoryFilter = TrackCategory | 'all'

const filterOptions: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  ...TRACK_CATEGORIES.map((category) => ({ value: category.id, label: category.label })),
]

// Выбранная категория хранится в адресе (?category=react), чтобы ссылкой можно было поделиться.
const category = computed<CategoryFilter>({
  get: () => {
    const value = route.query.category
    return filterOptions.some((option) => option.value === value) ? (value as CategoryFilter) : 'all'
  },
  set: (value) => {
    void router.replace({ query: value === 'all' ? {} : { category: value } })
  },
})

/** Группы для показа: при «Все» — каждая категория со своим заголовком, иначе одна выбранная. */
const groups = computed(() =>
  TRACK_CATEGORIES.filter((item) => category.value === 'all' || item.id === category.value).map((item) => ({
    ...item,
    tracks: TRACKS.filter((track) => track.category === item.id),
  })),
)

// Главная считает темы по индексу направлений (tracks.json, tracks-extra.json), а не по правкам из базы:
// иначе пришлось бы загружать правки всех уровней. Новые темы появляются здесь, когда индекс закоммичен.
const levels = TRACKS.flatMap((track) => track.levels)
const totalTopics = levels.reduce((sum, level) => sum + level.topicTitles.length, 0)

const seenTopics = computed(() =>
  levels.reduce((sum, level) => sum + progress.seenCount(level.id, level.topicTitles.length), 0),
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

    <section class="home-page__tracks" aria-labelledby="tracks-title">
      <div class="home-page__tracks-head">
        <h2 id="tracks-title" class="home-page__subtitle">Направления</h2>
        <SelectButton
          v-model="category"
          :options="filterOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-label="Категория направлений"
        />
      </div>

      <section
        v-for="group in groups"
        :key="group.id"
        class="home-page__category"
        :aria-labelledby="`category-${group.id}`"
      >
        <h3 :id="`category-${group.id}`" class="home-page__category-title">{{ group.label }}</h3>
        <TrackGrid v-if="group.tracks.length" :tracks="group.tracks" />
        <p v-else class="home-page__hint">Направления готовятся.</p>
      </section>
    </section>

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
