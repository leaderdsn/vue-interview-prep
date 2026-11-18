import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  deleteFeedback,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  fetchAllFeedback,
  fetchFeedbackImages,
  updateFeedback,
} from '@/entities/feedback'

import type { FeedbackItem, FeedbackStatus } from '@/entities/feedback'

export type FeedbackFilter = FeedbackStatus | 'all'

export const FILTER_LABELS: Readonly<Record<FeedbackFilter, string>> = {
  new: 'Новые',
  in_progress: 'В работе',
  fixed: 'Исправлено',
  rejected: 'Отклонено',
  all: 'Все',
}

export const FILTERS: FeedbackFilter[] = [...FEEDBACK_STATUSES, 'all']

/** Замечания с нужным статусом в исходном порядке (новые сверху). */
export function filterFeedback(items: readonly FeedbackItem[], filter: FeedbackFilter): FeedbackItem[] {
  return filter === 'all' ? [...items] : items.filter((item) => item.status === filter)
}

/** Сколько замечаний в каждом статусе (и всего). */
export function countByStatus(items: readonly FeedbackItem[]): Record<FeedbackFilter, number> {
  const counts = Object.fromEntries(FILTERS.map((filter) => [filter, 0])) as Record<FeedbackFilter, number>
  for (const item of items) counts[item.status] += 1
  counts.all = items.length
  return counts
}

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? `${fallback}: ${cause.message}` : fallback
}

/** Замечания пользователей в админке: список, фильтр по статусу, смена статуса, заметка, картинки, удаление. */
export const useReviewStore = defineStore('review-feedback', () => {
  const items = ref<FeedbackItem[]>([])
  const filter = ref<FeedbackFilter>('new')
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)
  /** Картинки замечаний по id: грузятся отдельно, когда карточка появилась на экране. */
  const images = ref<Record<string, string[]>>({})
  const imagesLoading = ref<Record<string, boolean>>({})

  const counts = computed(() => countByStatus(items.value))
  const newCount = computed(() => counts.value.new)
  const visible = computed(() => filterFeedback(items.value, filter.value))

  async function load() {
    loading.value = true
    error.value = null
    try {
      items.value = await fetchAllFeedback()
      loaded.value = true
    } catch (cause) {
      error.value = message(cause, 'Не удалось загрузить отзывы')
    } finally {
      loading.value = false
    }
  }

  function patchLocal(id: string, fields: Partial<FeedbackItem>) {
    items.value = items.value.map((item) => (item.id === id ? { ...item, ...fields } : item))
  }

  /** true — изменение сохранено в базе. */
  async function setStatus(id: string, status: FeedbackStatus): Promise<boolean> {
    error.value = null
    try {
      await updateFeedback(id, { status })
      patchLocal(id, { status })
      return true
    } catch (cause) {
      error.value = message(cause, `Не удалось поставить статус «${FEEDBACK_STATUS_LABELS[status]}»`)
      return false
    }
  }

  async function saveNote(id: string, note: string): Promise<boolean> {
    error.value = null
    try {
      await updateFeedback(id, { adminNote: note })
      const adminNote = note.trim()
      items.value = items.value.map((item) => {
        if (item.id !== id) return item
        const next: FeedbackItem = { ...item, adminNote }
        if (!adminNote) delete next.adminNote
        return next
      })
      return true
    } catch (cause) {
      error.value = message(cause, 'Не удалось сохранить заметку')
      return false
    }
  }

  /** Загружает картинки замечания один раз; повторные вызовы берут их из памяти. */
  async function loadImages(id: string): Promise<void> {
    if (images.value[id] || imagesLoading.value[id]) return
    imagesLoading.value = { ...imagesLoading.value, [id]: true }
    try {
      images.value = { ...images.value, [id]: await fetchFeedbackImages(id) }
    } catch (cause) {
      error.value = message(cause, 'Не удалось загрузить изображения')
    } finally {
      imagesLoading.value = { ...imagesLoading.value, [id]: false }
    }
  }

  async function remove(id: string): Promise<boolean> {
    error.value = null
    try {
      await deleteFeedback(id)
      items.value = items.value.filter((item) => item.id !== id)
      // Картинки удалённого замечания больше не нужны в памяти.
      const rest = { ...images.value }
      delete rest[id]
      images.value = rest
      return true
    } catch (cause) {
      error.value = message(cause, 'Не удалось удалить отзыв')
      return false
    }
  }

  return {
    items,
    filter,
    loading,
    loaded,
    error,
    images,
    imagesLoading,
    counts,
    newCount,
    visible,
    load,
    setStatus,
    saveNote,
    loadImages,
    remove,
  }
})
