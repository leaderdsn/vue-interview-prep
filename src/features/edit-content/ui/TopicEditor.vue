<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { MAX_TOPICS } from '@/entities/track'

import { createBlock, duplicateBlock, moveBlock } from '../model/blocks'
import { removeItem } from '../model/draft'
import { isTopicChanged } from '../model/topicDraft'

import AddBlock from './AddBlock.vue'
import BlockEditor from './BlockEditor.vue'
import RepoFiles from './RepoFiles.vue'

import type { Block, BlockType } from '../model/blocks'
import type { EditorFocus } from '../model/focus'
import type { LevelDraft } from '../model/levelDraft'
import type { TopicDraft } from '../model/topicDraft'
import type { LevelOverride } from '@/entities/track'

const { draft, override, focus = null } = defineProps<{
  /** Черновик уровня (темы и тест), его хранит ContentEditor. */
  draft: LevelDraft
  /** Текущая правка в базе, если есть. */
  override: LevelOverride | null
  /** Тема, которую открыть (номер с 1); тест здесь не учитывается. */
  focus?: EditorFocus | null
}>()

const index = ref(0)
/** Тема из замечания, которой в уровне уже нет (её удалили или переставили). */
const missingFocus = ref<number | null>(null)

watch(
  () => focus?.key,
  () => {
    missingFocus.value = null
    if (typeof focus?.step !== 'number') return
    if (focus.step >= 1 && focus.step <= draft.topics.length) index.value = focus.step - 1
    else missingFocus.value = focus.step
  },
  { immediate: true },
)

const status = ref<{ severity: 'success' | 'error'; text: string } | null>(null)
const busy = ref(false)
/** Подтверждение удаления темы на месте, а не window.confirm. */
const confirmingDelete = ref(false)

const hasOverride = computed(() => Boolean(override?.topics))
const brokenOverride = computed(() => hasOverride.value && !draft.topicsApplied)

const current = computed(() => draft.topics[index.value])
const blocks = computed(() => current.value?.blocks ?? [])
/** Новая тема или правка опубликованной (сравнение — с той же темой до перестановок). */
const changed = computed(() =>
  draft.topics.map((topic) =>
    topic.origin === null ? 'новая' : isTopicChanged(topic, draft.publishedTopics[topic.origin]) ? 'изменена' : '',
  ),
)
const savedAt = computed(() => (override?.updatedAt ? new Date(override.updatedAt).toLocaleString('ru-RU') : ''))

const topicOptions = computed(() =>
  draft.topics.map((topic, i) => ({
    value: i,
    label: `${i + 1}. ${topic.title.trim() || 'Без заголовка'}${changed.value[i] ? ` — ${changed.value[i]}` : ''}`,
  })),
)

// Номер выбранной темы не выходит за список (после удаления или отмены изменений).
watch(
  () => draft.topics.length,
  (length) => {
    if (index.value >= length) index.value = Math.max(length - 1, 0)
  },
)
watch(index, () => (confirmingDelete.value = false))

function updateTopic(fields: Partial<Pick<TopicDraft, 'title' | 'blocks'>>) {
  draft.updateTopic(index.value, fields)
}

function setBlocks(next: Block[]) {
  updateTopic({ blocks: next })
}

function addBlock(at: number, type: BlockType) {
  setBlocks([...blocks.value.slice(0, at), createBlock(type), ...blocks.value.slice(at)])
}

function updateBlock(at: number, block: Block) {
  setBlocks(blocks.value.map((item, i) => (i === at ? block : item)))
}

function duplicate(at: number) {
  const block = blocks.value[at]
  if (block) setBlocks([...blocks.value.slice(0, at + 1), duplicateBlock(block), ...blocks.value.slice(at + 1)])
}

function addTopic() {
  const added = draft.addTopic()
  if (added !== null) index.value = added
}

function moveTopic(offset: -1 | 1) {
  const target = index.value + offset
  if (target < 0 || target >= draft.topics.length) return
  draft.moveTopicBy(index.value, offset)
  index.value = target
}

function deleteTopic() {
  draft.deleteTopic(index.value)
  confirmingDelete.value = false
  index.value = Math.min(index.value, draft.topics.length - 1)
}

/** Вопросы теста, которые объясняет выбранная тема: после её удаления им нужно выбрать другую тему. */
const linkedQuestions = computed(() => draft.quiz.filter((question) => question.topic === index.value).length)

function discard() {
  draft.discardTopics()
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

function save() {
  const withQuiz = draft.structureChanged
  return run(
    () => draft.saveTopics(),
    withQuiz
      ? 'Сохранено: темы и тест с новыми номерами тем. Пользователи увидят их при следующем открытии уровня'
      : 'Сохранено: пользователи увидят новые темы при следующем открытии уровня',
  )
}

function reset() {
  const question = draft.resetTopicsResetsQuiz
    ? 'Вернуть темы из сборки? Тест из базы ссылается на темы, которых нет в сборке, поэтому он тоже будет удалён у всех пользователей.'
    : 'Вернуть темы из сборки? Правка тем в базе будет удалена у всех пользователей. Если темы переставлялись, проверьте темы вопросов в тесте.'
  if (!window.confirm(question)) return
  return run(() => draft.resetTopics(), 'Возвращены исходные темы')
}
</script>

<template>
  <div class="topic-editor">
    <p class="topic-editor__state" role="status">
      <template v-if="hasOverride">
        <i class="pi pi-cloud" aria-hidden="true" />
        Есть правка тем в базе<template v-if="savedAt"> от {{ savedAt }}</template><template v-if="override?.updatedBy">, {{ override.updatedBy }}</template>
      </template>
      <template v-else>
        <i class="pi pi-box" aria-hidden="true" />
        Сейчас у всех темы из сборки
      </template>
      · {{ draft.topics.length }} тем
    </p>
    <Message v-if="brokenOverride" severity="warn" size="small">
      Правка тем в базе некорректна или не подходит к тесту и пользователям не показывается; в редакторе — темы из сборки.
    </Message>
    <Message v-if="missingFocus !== null" severity="warn" size="small" closable @close="missingFocus = null">
      Темы {{ missingFocus }} в уровне нет (сейчас тем {{ draft.topics.length }}): возможно, её удалили или переставили.
      Выберите тему вручную.
    </Message>

    <div class="topic-editor__head">
      <label class="topic-editor__field">
        <span>Тема</span>
        <Select v-model="index" :options="topicOptions" option-label="label" option-value="value" class="topic-editor__select" />
      </label>
      <label v-if="current" class="topic-editor__field">
        <span>Заголовок темы</span>
        <InputText :model-value="current.title" fluid @update:model-value="updateTopic({ title: $event ?? '' })" />
      </label>
    </div>

    <div class="topic-editor__topic-actions" role="group" aria-label="Темы уровня">
      <Button
        label="Новая тема"
        icon="pi pi-plus"
        severity="secondary"
        size="small"
        :disabled="draft.topics.length >= MAX_TOPICS"
        :title="draft.topics.length >= MAX_TOPICS ? `В уровне может быть не больше ${MAX_TOPICS} тем` : undefined"
        @click="addTopic"
      />
      <Button
        icon="pi pi-arrow-up"
        severity="secondary"
        variant="text"
        size="small"
        aria-label="Поднять тему"
        :disabled="index === 0"
        @click="moveTopic(-1)"
      />
      <Button
        icon="pi pi-arrow-down"
        severity="secondary"
        variant="text"
        size="small"
        aria-label="Опустить тему"
        :disabled="index >= draft.topics.length - 1"
        @click="moveTopic(1)"
      />
      <span v-if="confirmingDelete" class="topic-editor__confirm" role="group" aria-label="Подтверждение удаления темы">
        Удалить тему {{ index + 1 }}?<template v-if="linkedQuestions"> Вопросам теста по ней ({{ linkedQuestions }}) нужно будет выбрать другую тему.</template>
        <Button label="Да, удалить" severity="danger" size="small" @click="deleteTopic" />
        <Button label="Отмена" severity="secondary" variant="text" size="small" @click="confirmingDelete = false" />
      </span>
      <Button
        v-else
        label="Удалить тему"
        icon="pi pi-trash"
        severity="danger"
        variant="text"
        size="small"
        :disabled="draft.topics.length <= 1"
        :title="draft.topics.length <= 1 ? 'В уровне должна остаться хотя бы одна тема' : undefined"
        @click="confirmingDelete = true"
      />
    </div>

    <p class="topic-editor__hint">
      В текстовых полях работает строчная разметка: <code>&lt;b&gt;</code>, <code>&lt;code&gt;</code>, <code>&lt;i&gt;</code>,
      <code>&lt;a href="https://…" target="_blank" rel="noopener"&gt;</code>. Неизменённые блоки сохраняются как были.
    </p>

    <ol v-if="current" class="topic-editor__blocks" aria-label="Блоки темы">
      <li v-for="(block, blockIndex) in blocks" :key="block.id" class="topic-editor__block">
        <AddBlock compact @add="addBlock(blockIndex, $event)" />
        <BlockEditor
          :model-value="block"
          :index="blockIndex"
          :total="blocks.length"
          @update:model-value="updateBlock(blockIndex, $event)"
          @move="setBlocks(moveBlock(blocks, blockIndex, blockIndex + $event))"
          @duplicate="duplicate(blockIndex)"
          @remove="setBlocks(removeItem(blocks, blockIndex))"
        />
      </li>
    </ol>
    <AddBlock @add="addBlock(blocks.length, $event)" />

    <section class="topic-editor__footer" aria-label="Сохранение тем">
      <ul v-if="draft.topicsSaveIssues.length" class="topic-editor__issues" role="alert">
        <li v-for="issue in draft.topicsSaveIssues" :key="issue">{{ issue }}</li>
      </ul>
      <p v-if="draft.structureChanged" class="topic-editor__hint">
        Темы добавлены, удалены или переставлены: номера тем в вопросах теста уже пересчитаны, и «Сохранить для всех»
        сохранит темы и тест вместе.
      </p>
      <Message v-if="status" :severity="status.severity" size="small" closable @close="status = null">{{ status.text }}</Message>
      <div class="topic-editor__actions">
        <Button
          label="Сохранить для всех"
          icon="pi pi-save"
          :loading="busy"
          :disabled="!draft.topicsDirty || draft.topicsSaveIssues.length > 0"
          @click="save"
        />
        <Button label="Отменить изменения" severity="secondary" variant="outlined" :disabled="!draft.topicsDirty || busy" @click="discard" />
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
@use './TopicEditor'
</style>
