<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import { createQuestion, moveItem, removeItem } from '../model/draft'

import QuestionEditor from './QuestionEditor.vue'
import RepoFiles from './RepoFiles.vue'

import { answerLengthIssues, MAX_QUIZ_VARIANTS } from '@/entities/track'

import type { EditorFocus } from '../model/focus'
import type { LevelDraft } from '../model/levelDraft'
import type { Level, LevelOverride, QuizQuestion } from '@/entities/track'

const { draft, level, override, focus = null } = defineProps<{
  /** Черновик уровня (темы и тест), его хранит ContentEditor. */
  draft: LevelDraft
  /** Уровень из сборки приложения. */
  level: Level
  /** Текущая правка в базе, если есть (теста в ней может не быть, если правились только темы). */
  override: LevelOverride | null
  /** Вопрос, к которому прокрутить (например, из замечания пользователя). */
  focus?: EditorFocus | null
}>()

const list = useTemplateRef<HTMLElement>('list')
/** Вопрос, к которому перешли: подсвечивается, пока не выбран другой. */
const highlighted = ref<number | null>(null)
/** Вопрос из замечания, которого в тесте уже нет. */
const missingFocus = ref<number | null>(null)

watch(
  () => focus?.key,
  async () => {
    missingFocus.value = null
    const target = focus?.step === 'quiz' ? focus.questionIndex : undefined
    if (target === undefined) return
    draft.selectVariant(focus?.quizVariant ?? 0)
    if (target < 0 || target >= draft.quiz.length) {
      missingFocus.value = target
      return
    }
    highlighted.value = target
    await nextTick()
    const card = list.value?.children[target] as HTMLElement | undefined
    card?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    card?.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true })
  },
  { immediate: true },
)

const hasOverride = computed(() => Boolean(override?.quizVariants))
const brokenOverride = computed(() => hasOverride.value && !draft.quizApplied)

const status = ref<{ severity: 'success' | 'error'; text: string } | null>(null)
const busy = ref(false)

const fileQuizCount = computed(() => level.quizVariants[0]?.length ?? 0)
/** Число вопросов или вариантов отличается от файла уровня в репозитории. */
const countChanged = computed(
  () => (draft.variants[0]?.length ?? 0) !== fileQuizCount.value || draft.variants.length !== level.quizVariants.length,
)

const variantOptions = computed(() => draft.variants.map((_, index) => ({ value: index, label: `Вариант ${index + 1}` })))
const activeVariant = computed({
  get: () => draft.variant,
  set: (value: number) => draft.selectVariant(value),
})

function addVariant() {
  draft.addVariant()
}

function removeVariant() {
  if (window.confirm(`Удалить вариант ${draft.variant + 1} целиком? Изменение попадёт к пользователям после сохранения.`)) {
    draft.removeVariant(draft.variant)
  }
}
/** Перекос длины ответов во всём тесте; подсказки по отдельным вопросам показывает QuestionEditor. */
const lengthWarnings = computed(() => answerLengthIssues(draft.quiz).filter((issue) => !issue.startsWith('Вопрос ')))
const savedAt = computed(() => (override?.updatedAt ? new Date(override.updatedAt).toLocaleString('ru-RU') : ''))

function add() {
  draft.setQuiz([...draft.quiz, createQuestion()])
}

function update(index: number, question: QuizQuestion) {
  draft.setQuiz(draft.quiz.map((item, i) => (i === index ? question : item)))
}

function move(index: number, offset: -1 | 1) {
  draft.setQuiz(moveItem(draft.quiz, index, index + offset))
}

function remove(index: number) {
  if (window.confirm(`Удалить вопрос ${index + 1}?`)) draft.setQuiz(removeItem(draft.quiz, index))
}

function discard() {
  draft.discardQuiz()
  status.value = null
}

async function run(action: () => Promise<void>, done: string) {
  busy.value = true
  status.value = null
  try {
    await action()
    status.value = { severity: 'success', text: done }
  } catch (cause) {
    status.value = { severity: 'error', text: cause instanceof Error ? cause.message : 'Не удалось сохранить' }
  } finally {
    busy.value = false
  }
}

/** При изменённой структуре тем тест сохраняется вместе с темами: номера тем в вопросах относятся к новым темам. */
const saveDisabled = computed(() => !(draft.quizDirty || draft.structureChanged) || draft.quizSaveIssues.length > 0)

function save() {
  const withTopics = draft.structureChanged
  return run(
    () => draft.saveQuiz(),
    withTopics
      ? 'Сохранено: тест и темы вместе. Пользователи увидят их при следующем открытии уровня'
      : 'Сохранено: пользователи увидят новый тест при следующем открытии уровня',
  )
}

function reset() {
  const question = draft.resetQuizResetsTopics
    ? 'Вернуть тест из сборки? Он ссылается на темы, которых нет в правке тем, поэтому правка тем тоже будет удалена у всех пользователей.'
    : 'Вернуть тест из сборки? Правка теста в базе будет удалена у всех пользователей.'
  if (!window.confirm(question)) return
  return run(() => draft.resetQuiz(), 'Возвращена исходная версия теста')
}
</script>

<template>
  <div class="quiz-editor">
    <p class="quiz-editor__state" role="status">
      <template v-if="hasOverride">
        <i class="pi pi-cloud" aria-hidden="true" />
        Сейчас у всех правка теста из базы<template v-if="savedAt"> от {{ savedAt }}</template><template v-if="override?.updatedBy"> ({{ override.updatedBy }})</template>
      </template>
      <template v-else>
        <i class="pi pi-box" aria-hidden="true" />
        Сейчас у всех исходная версия из сборки
      </template>
      · вариантов: {{ draft.variants.length }}, в каждом {{ draft.variants[0]?.length ?? 0 }} вопросов
    </p>

    <div class="quiz-editor__variants" role="group" aria-label="Варианты теста">
      <SelectButton
        v-model="activeVariant"
        :options="variantOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-label="Вариант теста в редакторе"
      />
      <Button
        label="Добавить вариант"
        icon="pi pi-plus"
        severity="secondary"
        variant="outlined"
        size="small"
        :disabled="draft.variants.length >= MAX_QUIZ_VARIANTS"
        @click="addVariant"
      />
      <Button
        v-if="draft.variants.length > 1"
        label="Удалить вариант"
        icon="pi pi-trash"
        severity="danger"
        variant="text"
        size="small"
        @click="removeVariant"
      />
    </div>
    <p class="quiz-editor__hint">
      Пользователь при каждом прохождении получает вариант, который ещё не проходил. В вариантах одинаковое число вопросов
      с тем же распределением по темам, вопросы не повторяются; новый вариант создаётся заготовкой по темам варианта 1.
    </p>
    <Message v-if="brokenOverride" severity="warn" size="small">
      Правка теста в базе не подходит к темам уровня и пользователям не показывается; в редакторе — тест из сборки.
    </Message>
    <Message v-if="missingFocus !== null" severity="warn" size="small" closable @close="missingFocus = null">
      Вопроса {{ missingFocus + 1 }} в {{ draft.variants.length > 1 ? `варианте ${draft.variant + 1}` : 'тесте' }} нет
      (сейчас вопросов {{ draft.quiz.length }}): возможно, его удалили.
    </Message>

    <Message v-if="lengthWarnings.length" severity="warn" size="small">
      Ответы можно угадать по длине: {{ lengthWarnings.join('; ') }}. Сохранить можно, но лучше выровнять варианты.
    </Message>

    <div ref="list" class="quiz-editor__list">
      <QuestionEditor
        v-for="(question, index) in draft.quiz"
        :key="`${draft.variant}-${index}`"
        :model-value="question"
        :index="index"
        :total="draft.quiz.length"
        :topic-titles="draft.titles"
        :class="{ 'quiz-editor__focused': highlighted === index }"
        @update:model-value="update(index, $event)"
        @move="move(index, $event)"
        @remove="remove(index)"
      />
      <Button label="Добавить вопрос" icon="pi pi-plus" severity="secondary" @click="add" />
    </div>

    <section class="quiz-editor__footer" aria-label="Сохранение">
      <ul v-if="draft.quizSaveIssues.length" class="quiz-editor__issues" role="alert">
        <li v-for="issue in draft.quizSaveIssues" :key="issue">{{ issue }}</li>
      </ul>
      <p v-if="draft.structureChanged" class="quiz-editor__hint">
        Темы добавлены, удалены или переставлены: «Сохранить для всех» сохранит тест вместе с темами.
      </p>
      <p v-if="countChanged" class="quiz-editor__hint">
        Сейчас вариантов {{ draft.variants.length }} по {{ draft.variants[0]?.length ?? 0 }} вопросов, а в файле уровня
        {{ level.quizVariants.length }} по {{ fileQuizCount }}: для репозитория скачайте и JSON уровня, и индекс направлений
        (в нём <code>quizCount</code> и <code>quizVariants</code>).
      </p>
      <Message v-if="status" :severity="status.severity" size="small" closable @close="status = null">{{ status.text }}</Message>
      <div class="quiz-editor__actions">
        <Button label="Сохранить для всех" icon="pi pi-save" :loading="busy" :disabled="saveDisabled" @click="save" />
        <Button label="Отменить изменения" severity="secondary" variant="outlined" :disabled="!draft.quizDirty || busy" @click="discard" />
        <Button
          v-if="hasOverride"
          label="Вернуть исходную версию"
          icon="pi pi-undo"
          severity="danger"
          variant="text"
          :disabled="busy"
          @click="reset"
        />
      </div>
      <RepoFiles :draft="draft" />
    </section>
  </div>
</template>

<style lang="sass" scoped>
@use './QuizEditor'
</style>
