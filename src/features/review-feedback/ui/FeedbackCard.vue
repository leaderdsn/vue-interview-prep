<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { describeContext, FEEDBACK_KIND_LABELS, FEEDBACK_LIMITS, FEEDBACK_STATUS_LABELS, FEEDBACK_STATUSES } from '@/entities/feedback'

import { useReviewStore } from '../model/reviewStore'

import type { EditorTarget } from '../model/target'
import type { FeedbackItem, FeedbackStatus } from '@/entities/feedback'

const { item } = defineProps<{ item: FeedbackItem }>()

const emit = defineEmits<{
  /** Открыть тему или вопрос из замечания в редакторе контента. */
  'open-editor': [target: EditorTarget]
}>()

const review = useReviewStore()

const statusOptions = FEEDBACK_STATUSES.map((value) => ({ value, label: FEEDBACK_STATUS_LABELS[value] }))

const note = ref(item.adminNote ?? '')
watch(
  () => item.adminNote,
  (value) => (note.value = value ?? ''),
)
const noteChanged = computed(() => note.value.trim() !== (item.adminNote ?? ''))

const confirming = ref(false)
const busy = ref(false)

const date = computed(() => new Date(item.createdAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }))
/** Ссылка на страницу с учётом base сайта: открывается в новой вкладке. */
const pageHref = computed(() => `${import.meta.env.BASE_URL.replace(/\/+$/, '')}${item.page}`)

const editorTarget = computed<EditorTarget | null>(() =>
  item.levelId && item.step !== undefined
    ? { levelId: item.levelId, step: item.step, ...(item.questionIndex === undefined ? {} : { questionIndex: item.questionIndex }) }
    : null,
)

async function run(action: () => Promise<boolean>) {
  busy.value = true
  try {
    return await action()
  } finally {
    busy.value = false
  }
}

function setStatus(status: FeedbackStatus) {
  if (status !== item.status) void run(() => review.setStatus(item.id, status))
}

function saveNote() {
  void run(() => review.saveNote(item.id, note.value))
}

function remove() {
  void run(() => review.remove(item.id)).then((ok) => {
    if (!ok) confirming.value = false
  })
}
</script>

<template>
  <article class="feedback-card" :class="`feedback-card--${item.status}`" :aria-busy="busy">
    <header class="feedback-card__head">
      <span class="feedback-card__kind">{{ FEEDBACK_KIND_LABELS[item.kind] }}</span>
      <span class="feedback-card__status">{{ FEEDBACK_STATUS_LABELS[item.status] }}</span>
      <time class="feedback-card__date" :datetime="new Date(item.createdAt).toISOString()">{{ date }}</time>
    </header>

    <p class="feedback-card__text">{{ item.text }}</p>
    <blockquote v-if="item.quote" class="feedback-card__quote">{{ item.quote }}</blockquote>

    <dl class="feedback-card__meta">
      <div>
        <dt>Где</dt>
        <dd>
          {{ describeContext(item) }} ·
          <a :href="pageHref" target="_blank" rel="noopener">
            Открыть страницу <i class="pi pi-external-link" aria-hidden="true" />
          </a>
        </dd>
      </div>
      <div v-if="item.questionText">
        <dt>Вопрос</dt>
        <dd>{{ item.questionText }}</dd>
      </div>
      <div v-if="item.email">
        <dt>Почта</dt>
        <dd><a :href="`mailto:${item.email}`">{{ item.email }}</a></dd>
      </div>
      <div>
        <dt>Версия</dt>
        <dd>v{{ item.appVersion }}</dd>
      </div>
    </dl>

    <div class="feedback-card__actions">
      <label class="feedback-card__field">
        <span>Статус</span>
        <Select
          :model-value="item.status"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          :disabled="busy"
          @update:model-value="setStatus"
        />
      </label>
      <Button
        v-if="editorTarget"
        label="Открыть в редакторе"
        icon="pi pi-pencil"
        severity="secondary"
        variant="outlined"
        size="small"
        @click="emit('open-editor', editorTarget)"
      />
      <span v-if="confirming" class="feedback-card__confirm" role="group" aria-label="Подтверждение удаления">
        Удалить отзыв навсегда?
        <Button label="Да, удалить" severity="danger" size="small" :loading="busy" @click="remove" />
        <Button label="Отмена" severity="secondary" variant="text" size="small" :disabled="busy" @click="confirming = false" />
      </span>
      <Button v-else label="Удалить" icon="pi pi-trash" severity="danger" variant="text" size="small" @click="confirming = true" />
    </div>

    <div class="feedback-card__note">
      <label class="feedback-card__field">
        <span>Заметка администратора (автор её не видит)</span>
        <Textarea v-model="note" rows="2" auto-resize fluid :maxlength="FEEDBACK_LIMITS.adminNote" />
      </label>
      <Button
        label="Сохранить заметку"
        severity="secondary"
        size="small"
        :disabled="!noteChanged || busy"
        @click="saveNote"
      />
    </div>
  </article>
</template>

<style lang="sass" scoped>
@use './FeedbackCard'
</style>
