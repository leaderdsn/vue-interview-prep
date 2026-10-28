<script setup lang="ts">
import { QUIZ_STEP, ROUTE_NAMES } from '@/shared/config'

defineProps<{
  levelId: string
  titles: readonly string[]
  seenTopics: readonly number[]
  step: number | typeof QUIZ_STEP
  quizPassed: boolean
}>()
</script>

<template>
  <nav class="level-rail" aria-label="Шаги уровня">
    <ol class="level-rail__list">
      <li v-for="(title, index) in titles" :key="index">
        <RouterLink
          class="rail-step"
          :class="{ 'rail-step--active': step === index + 1, 'rail-step--done': seenTopics.includes(index) }"
          :to="{ name: ROUTE_NAMES.level, params: { levelId, step: String(index + 1) } }"
          :aria-current="step === index + 1 ? 'step' : undefined"
        >
          <span class="rail-step__num" aria-hidden="true">
            <i v-if="seenTopics.includes(index) && step !== index + 1" class="pi pi-check" />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="rail-step__title">{{ title }}</span>
          <span v-if="seenTopics.includes(index)" class="rail-step__sr">прочитано</span>
        </RouterLink>
      </li>
      <li>
        <RouterLink
          class="rail-step rail-step--test"
          :class="{ 'rail-step--active': step === QUIZ_STEP, 'rail-step--done': quizPassed }"
          :to="{ name: ROUTE_NAMES.level, params: { levelId, step: QUIZ_STEP } }"
          :aria-current="step === QUIZ_STEP ? 'step' : undefined"
        >
          <span class="rail-step__num" aria-hidden="true">
            <i v-if="quizPassed && step !== QUIZ_STEP" class="pi pi-check" />
            <i v-else class="pi pi-pencil" />
          </span>
          <span class="rail-step__title">Тест</span>
          <span v-if="quizPassed" class="rail-step__sr">сдан</span>
        </RouterLink>
      </li>
    </ol>
  </nav>
</template>

<style lang="sass" scoped>
@use './LevelRail'
</style>
