<script setup lang="ts">
import { useProgressStore } from '@/entities/progress'
import { LEVEL_LABELS, TRACKS } from '@/entities/track'
import { ROUTE_NAMES } from '@/shared/config'

import { scoreTone } from '../lib/scoreTone'

import type { Track } from '@/entities/track'

const { tracks = TRACKS } = defineProps<{ tracks?: readonly Track[] }>()

const progress = useProgressStore()

const TONE_ICONS = { good: 'pi pi-check', bad: 'pi pi-times', neutral: 'pi pi-minus' } as const
</script>

<template>
  <ul class="track-grid">
    <li v-for="track in tracks" :key="track.id" class="track-card">
      <h3 class="track-card__title">{{ track.title }}</h3>
      <p class="track-card__description">{{ track.description }}</p>

      <ul class="track-card__levels">
        <li v-for="level in track.levels" :key="level.id">
          <RouterLink
            class="level-link"
            :to="{ name: ROUTE_NAMES.level, params: { levelId: level.id } }"
            :data-level="level.id"
          >
            <span class="level-link__name">{{ LEVEL_LABELS[level.level] }}</span>
            <span class="level-link__description">{{ level.description }}</span>
            <span class="level-link__status">
              <span class="level-link__topics">
                {{ progress.getLevel(level.id).seenTopics.length }}/{{ level.topicTitles.length }}
                <span class="level-link__unit">тем</span>
              </span>
              <span
                v-if="progress.getLevel(level.id).bestScore !== null"
                class="score-pill"
                :class="`score-pill--${scoreTone(progress.getLevel(level.id).bestScore ?? 0)}`"
              >
                <i :class="TONE_ICONS[scoreTone(progress.getLevel(level.id).bestScore ?? 0)]" aria-hidden="true" />
                <span class="visually-hidden">Лучший результат теста:</span>
                {{ progress.getLevel(level.id).bestScore }}%
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </li>
  </ul>
</template>

<style lang="sass" scoped>
@use './TrackGrid'
</style>
