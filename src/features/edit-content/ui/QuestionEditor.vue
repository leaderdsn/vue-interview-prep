<script setup lang="ts">
import { computed } from 'vue'

import { TYPE_LABELS } from '../model/draft'
import { DELETED_TOPIC, questionDraftIssues } from '../model/structure'

import type { QuestionType, QuizQuestion } from '@/entities/track'

const { index, total, topicTitles } = defineProps<{
  index: number
  total: number
  topicTitles: readonly string[]
}>()

const emit = defineEmits<{
  remove: []
  move: [offset: -1 | 1]
}>()

const question = defineModel<QuizQuestion>({ required: true })

const typeOptions = (Object.keys(TYPE_LABELS) as QuestionType[]).map((value) => ({ value, label: TYPE_LABELS[value] }))
const topicOptions = computed(() => topicTitles.map((title, i) => ({ value: i, label: `${i + 1}. ${title}` })))
const issues = computed(() => questionDraftIssues(question.value, topicTitles.length))
/** Тема вопроса удалена в черновике тем: выбор пустой, пока не выбрана другая. */
const topicDeleted = computed(() => question.value.topic === DELETED_TOPIC)

function patch(fields: Partial<QuizQuestion>) {
  question.value = { ...question.value, ...fields }
}

function setOption(optionIndex: number, text: string) {
  patch({ options: question.value.options.map((option, i) => (i === optionIndex ? text : option)) })
}
</script>

<template>
  <fieldset class="editor-card" :class="{ 'editor-card--invalid': issues.length > 0 }">
    <legend class="editor-card__legend">Вопрос {{ index + 1 }}</legend>

    <div class="editor-card__row">
      <label class="editor-field">
        <span>Тип</span>
        <Select
          :model-value="question.type"
          :options="typeOptions"
          option-label="label"
          option-value="value"
          @update:model-value="patch({ type: $event })"
        />
      </label>
      <label class="editor-field">
        <span>Тема, где объясняется ответ</span>
        <Select
          :model-value="topicDeleted ? null : question.topic"
          :options="topicOptions"
          option-label="label"
          option-value="value"
          :placeholder="topicDeleted ? 'Тема удалена — выберите другую' : 'Выберите тему'"
          :invalid="topicDeleted"
          @update:model-value="patch({ topic: $event })"
        />
      </label>
    </div>

    <label class="editor-field">
      <span>Текст вопроса</span>
      <Textarea :model-value="question.question" auto-resize rows="2" @update:model-value="patch({ question: $event })" />
    </label>

    <label class="editor-field">
      <span>Код (необязательно)</span>
      <Textarea
        class="editor-code"
        :model-value="question.code ?? ''"
        auto-resize
        rows="2"
        spellcheck="false"
        @update:model-value="patch({ code: $event })"
      />
    </label>

    <div class="editor-field" role="group" :aria-label="`Варианты ответа на вопрос ${index + 1}`">
      <span>Варианты — отметьте правильный</span>
      <ul class="editor-options">
        <li v-for="(option, optionIndex) in question.options" :key="optionIndex" class="editor-options__item">
          <input
            type="radio"
            :name="`correct-${index}`"
            :checked="question.answer === optionIndex"
            :aria-label="`Вариант ${optionIndex + 1} правильный`"
            @change="patch({ answer: optionIndex })"
          >
          <InputText
            :model-value="option"
            :aria-label="`Вариант ${optionIndex + 1}`"
            fluid
            @update:model-value="setOption(optionIndex, $event ?? '')"
          />
        </li>
      </ul>
    </div>

    <label class="editor-field">
      <span>Пояснение после проверки</span>
      <Textarea :model-value="question.explanation" auto-resize rows="2" @update:model-value="patch({ explanation: $event })" />
    </label>

    <ul v-if="issues.length" class="editor-card__issues">
      <li v-for="issue in issues" :key="issue">{{ issue }}</li>
    </ul>

    <div class="editor-card__actions">
      <Button
        icon="pi pi-arrow-up"
        severity="secondary"
        variant="text"
        size="small"
        :aria-label="`Поднять вопрос ${index + 1}`"
        :disabled="index === 0"
        @click="emit('move', -1)"
      />
      <Button
        icon="pi pi-arrow-down"
        severity="secondary"
        variant="text"
        size="small"
        :aria-label="`Опустить вопрос ${index + 1}`"
        :disabled="index === total - 1"
        @click="emit('move', 1)"
      />
      <Button label="Удалить вопрос" icon="pi pi-trash" severity="danger" variant="text" size="small" @click="emit('remove')" />
    </div>
  </fieldset>
</template>

<style lang="sass" scoped>
@use './QuestionEditor'
</style>
