import { defineStore } from 'pinia'
import { ref } from 'vue'

import { isFirebaseConfigured } from '@/shared/lib'

import type { FeedbackContext, FeedbackKind } from '@/entities/feedback'

export type FeedbackRequest = {
  /** Тип, выбранный заранее по месту, откуда открыта форма. */
  kind: FeedbackKind
  context: FeedbackContext
}

/** Сколько висит уведомление «Спасибо! Замечание отправлено». */
const NOTICE_MS = 4000

/** Путь текущей страницы в приложении без base: `/level/vue-junior/3`. */
export function currentPage(base = import.meta.env.BASE_URL, pathname = location.pathname): string {
  const prefix = base.replace(/\/+$/, '')
  const path = prefix && pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname
  return path || '/'
}

/**
 * Открытие формы замечания из любого места. Сам стор маленький и лежит в основном бандле;
 * форма и SDK Firebase грузятся отдельно, когда форму впервые открыли.
 */
export const useFeedbackStore = defineStore('feedback', () => {
  /** Без Firebase отправлять некуда — точки входа скрыты. */
  const available = isFirebaseConfigured()
  const visible = ref(false)
  /** Форму открывали хотя бы раз: до этого её чанк не загружается. */
  const requested = ref(false)
  const request = ref<FeedbackRequest | null>(null)
  /** Время последней успешной отправки: повтор раньше 30 секунд правила базы всё равно отклонят. */
  const lastSentAt = ref<number | null>(null)
  const notice = ref<string | null>(null)
  let noticeTimer: ReturnType<typeof setTimeout> | undefined

  function open(kind: FeedbackKind, context: Partial<FeedbackContext> = {}) {
    request.value = { kind, context: { ...context, page: context.page ?? currentPage() } }
    requested.value = true
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  function markSent() {
    lastSentAt.value = Date.now()
    visible.value = false
    notice.value = 'Спасибо! Замечание отправлено'
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (notice.value = null), NOTICE_MS)
  }

  return { available, visible, requested, request, lastSentAt, notice, open, close, markSent }
})
