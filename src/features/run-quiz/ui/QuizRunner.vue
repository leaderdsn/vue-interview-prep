<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import { PASS_SCORE, useProgressStore } from '@/entities/progress'

import { createQuizSession, scoreQuiz } from '../model/quiz'

import type { Level } from '@/entities/track'

import type { QuizAnswers, QuizResult } from '../model/quiz'

const { level } = defineProps<{ level: Level }>()

const emit = defineEmits<{
  'review-topic': [topicIndex: number]
}>()

const TYPE_LABELS = { theory: 'Теория', practice: 'Практика' } as const

const progress = useProgressStore()

const session = ref(createQuizSession(level.quiz))
const answers = ref<QuizAnswers>({})
const result = ref<QuizResult | null>(null)
const warnedUnanswered = ref(false)
const resultRef = useTemplateRef<HTMLElement>('resultRef')

const items = computed(() => session.value.map((item) => ({ ...item, question: level.quiz[item.questionIndex]! })))
const unansweredCount = computed(() => level.quiz.length - Object.keys(answers.value).length)
const passed = computed(() => (result.value?.percent ?? 0) >= PASS_SCORE)
const checked = computed(() => result.value !== null)

watch(() => level.id, restart)

function select(questionIndex: number, optionIndex: number) {
  if (checked.value) return
  answers.value = { ...answers.value, [questionIndex]: optionIndex }
  warnedUnanswered.value = false
}

async function check() {
  if (unansweredCount.value > 0 && !warnedUnanswered.value) {
    warnedUnanswered.value = true
    return
  }
  result.value = scoreQuiz(level.quiz, answers.value)
  progress.recordQuizResult(level.id, result.value.percent)
  await nextTick()
  resultRef.value?.focus()
}

function restart() {
  session.value = createQuizSession(level.quiz)
  answers.value = {}
  result.value = null
  warnedUnanswered.value = false
  window.scrollTo?.({ top: 0 })
}

function optionState(questionIndex: number, optionIndex: number): 'right' | 'wrong' | null {
  if (!checked.value) return null
  if (optionIndex === level.quiz[questionIndex]?.answer) return 'right'
  return answers.value[questionIndex] === optionIndex ? 'wrong' : null
}

function isCorrect(questionIndex: number) {
  return answers.value[questionIndex] === level.quiz[questionIndex]?.answer
}
</script>

<template>
  <div class="quiz-runner">
    <p class="quiz-runner__intro">
      {{ level.quiz.length }} вопросов · для зачёта нужно {{ PASS_SCORE }}% · варианты каждый раз перемешиваются
    </p>

    <section
      v-if="result"
      ref="resultRef"
      class="quiz-result"
      :class="passed ? 'quiz-result--passed' : 'quiz-result--failed'"
      tabindex="-1"
      aria-labelledby="quiz-result-title"
    >
      <h2 id="quiz-result-title" class="quiz-result__title">
        <i :class="passed ? 'pi pi-check-circle' : 'pi pi-info-circle'" aria-hidden="true" />
        {{ passed ? 'Тест сдан' : 'Пока не зачёт' }}
      </h2>
      <p class="quiz-result__score">
        <strong>{{ result.percent }}%</strong>
        <span>{{ result.correct }} из {{ result.total }} верно</span>
      </p>
      <ul class="quiz-result__split">
        <li>Теория: {{ result.byType.theory.correct }}/{{ result.byType.theory.total }}</li>
        <li>Практика: {{ result.byType.practice.correct }}/{{ result.byType.practice.total }}</li>
      </ul>
      <p class="quiz-result__hint">
        {{ passed ? 'Отличный результат. Можно переходить к следующему уровню.' : 'Разберите ошибки ниже, перечитайте темы и попробуйте ещё раз.' }}
      </p>
      <Button label="Пройти заново" icon="pi pi-refresh" severity="secondary" @click="restart" />
    </section>

    <ol class="quiz-runner__list">
      <li v-for="(item, position) in items" :key="item.questionIndex" class="question" :data-question="position">
        <template v-if="item.question">
          <fieldset class="question__fieldset" :class="{ 'question__fieldset--checked': checked }">
            <legend class="question__legend">
              <span class="question__number">{{ position + 1 }} / {{ items.length }}</span>
              <span class="question__tag" :class="`question__tag--${item.question.type}`">{{ TYPE_LABELS[item.question.type] }}</span>
              <span v-if="checked" class="question__verdict" :class="isCorrect(item.questionIndex) ? 'is-right' : 'is-wrong'">
                <i :class="isCorrect(item.questionIndex) ? 'pi pi-check' : 'pi pi-times'" aria-hidden="true" />
                {{ isCorrect(item.questionIndex) ? 'Верно' : answers[item.questionIndex] === undefined ? 'Нет ответа' : 'Неверно' }}
              </span>
            </legend>

            <p class="question__text">{{ item.question.question }}</p>
            <pre v-if="item.question.code" class="question__code"><code>{{ item.question.code }}</code></pre>

            <div class="question__options">
              <label
                v-for="optionIndex in item.optionOrder"
                :key="optionIndex"
                class="option"
                :class="optionState(item.questionIndex, optionIndex)"
              >
                <input
                  class="option__input"
                  type="radio"
                  :name="`q-${item.questionIndex}`"
                  :value="optionIndex"
                  :checked="answers[item.questionIndex] === optionIndex"
                  :disabled="checked"
                  @change="select(item.questionIndex, optionIndex)"
                >
                <span class="option__box">
                  <span class="option__text">{{ item.question.options[optionIndex] }}</span>
                  <span v-if="optionState(item.questionIndex, optionIndex) === 'right'" class="option__mark">
                    <i class="pi pi-check" aria-hidden="true" /> Правильный ответ
                  </span>
                  <span v-else-if="optionState(item.questionIndex, optionIndex) === 'wrong'" class="option__mark">
                    <i class="pi pi-times" aria-hidden="true" /> Ваш ответ
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <div v-if="checked" class="question__explain">
            <p>{{ item.question.explanation }}</p>
            <button type="button" class="question__review" @click="emit('review-topic', item.question.topic)">
              Перечитать тему
            </button>
          </div>
        </template>
      </li>
    </ol>

    <div v-if="!checked" class="quiz-runner__actions">
      <p v-if="warnedUnanswered" class="quiz-runner__warn" role="alert">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        Без ответа осталось вопросов: {{ unansweredCount }}. Они засчитаются как неверные. Нажмите ещё раз, чтобы проверить.
      </p>
      <Button label="Проверить" icon="pi pi-check" @click="check" />
    </div>
    <div v-else class="quiz-runner__actions">
      <Button label="Пройти заново" icon="pi pi-refresh" severity="secondary" @click="restart" />
    </div>
  </div>
</template>

<style lang="sass" scoped>
@use './QuizRunner'
</style>
