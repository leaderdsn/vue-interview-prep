<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

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

const imageCount = computed(() => item.imageCount ?? 0)
const images = computed(() => review.images[item.id] ?? [])
const imagesLoading = computed(() => review.imagesLoading[item.id] === true)
/** Номер картинки, открытой в полном размере; null — просмотр закрыт. */
const preview = ref<number | null>(null)
const previewVisible = computed({
  get: () => preview.value !== null,
  set: (value) => {
    if (!value) preview.value = null
  },
})
const previewUrl = computed(() => (preview.value === null ? '' : (images.value[preview.value] ?? '')))

/** Имя файла для «Скачать»: расширение по типу из data URL. */
function fileName(url: string, index: number) {
  const type = /^data:image\/(webp|png|jpeg);/.exec(url)?.[1] ?? 'png'
  return `feedback-${item.id}-${index + 1}.${type === 'jpeg' ? 'jpg' : type}`
}

// Картинки весят сотни килобайт: грузим их, только когда карточка показалась на экране.
const root = useTemplateRef<HTMLElement>('root')
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!imageCount.value) return
  if (typeof IntersectionObserver !== 'function' || !root.value) {
    void review.loadImages(item.id)
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer?.disconnect()
    observer = null
    void review.loadImages(item.id)
  })
  observer.observe(root.value)
})

onBeforeUnmount(() => observer?.disconnect())

const confirming = ref(false)
const busy = ref(false)

const date = computed(() => new Date(item.createdAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }))
/** Ссылка на страницу с учётом base сайта: открывается в новой вкладке. */
const pageHref = computed(() => `${import.meta.env.BASE_URL.replace(/\/+$/, '')}${item.page}`)

const editorTarget = computed<EditorTarget | null>(() =>
  item.levelId && item.step !== undefined
    ? {
        levelId: item.levelId,
        step: item.step,
        ...(item.quizVariant === undefined ? {} : { quizVariant: item.quizVariant }),
        ...(item.questionIndex === undefined ? {} : { questionIndex: item.questionIndex }),
      }
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
  <article ref="root" class="feedback-card" :class="`feedback-card--${item.status}`" :aria-busy="busy">
    <header class="feedback-card__head">
      <span class="feedback-card__kind">{{ FEEDBACK_KIND_LABELS[item.kind] }}</span>
      <span class="feedback-card__status">{{ FEEDBACK_STATUS_LABELS[item.status] }}</span>
      <time class="feedback-card__date" :datetime="new Date(item.createdAt).toISOString()">{{ date }}</time>
    </header>

    <p class="feedback-card__text">{{ item.text }}</p>
    <blockquote v-if="item.quote" class="feedback-card__quote">{{ item.quote }}</blockquote>

    <section v-if="imageCount" class="feedback-card__images" aria-label="Изображения">
      <p v-if="imagesLoading && !images.length" class="feedback-card__images-note" role="status">
        Загружаем изображения ({{ imageCount }})…
      </p>
      <p v-else-if="!images.length" class="feedback-card__images-note">Изображения: {{ imageCount }}</p>
      <ul v-else class="feedback-card__thumbs">
        <li v-for="(url, index) in images" :key="index">
          <button type="button" class="feedback-card__thumb" :aria-label="`Открыть изображение ${index + 1}`" @click="preview = index">
            <img :src="url" :alt="`Изображение ${index + 1}`">
          </button>
        </li>
      </ul>
    </section>

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

    <Dialog
      v-model:visible="previewVisible"
      modal
      dismissable-mask
      :draggable="false"
      :header="preview === null ? '' : `Изображение ${preview + 1}`"
      :style="{ width: 'min(64rem, calc(100vw - 2rem))' }"
    >
      <figure v-if="previewUrl" class="feedback-card__full">
        <img :src="previewUrl" :alt="`Изображение ${(preview ?? 0) + 1} в полном размере`">
        <figcaption>
          <a :href="previewUrl" :download="fileName(previewUrl, preview ?? 0)">
            <i class="pi pi-download" aria-hidden="true" /> Скачать
          </a>
        </figcaption>
      </figure>
    </Dialog>
  </article>
</template>

<style lang="sass" scoped>
@use './FeedbackCard'
</style>
