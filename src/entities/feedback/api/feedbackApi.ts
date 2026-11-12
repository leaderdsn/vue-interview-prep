import { APP_VERSION } from '@/shared/config'
import { loadFirebase } from '@/shared/lib'

import { FEEDBACK_PATH, feedbackLimitPath } from '../config/feedback'
import { buildFeedbackRecord, parseFeedbackList } from '../lib/report'

import type { FeedbackDraft, FeedbackItem, FeedbackStatus } from '../model/types'

/** Без сети запись в Realtime Database не падает, а ждёт соединения; столько ждём ответа сервера. */
const SEND_TIMEOUT_MS = 15_000

/** Сколько последних замечаний загружает админка. */
const ADMIN_LIST_LIMIT = 500

export type FeedbackErrorCode = 'too-frequent' | 'network' | 'unknown'

export class FeedbackError extends Error {
  readonly code: FeedbackErrorCode

  constructor(code: FeedbackErrorCode, message: string) {
    super(message)
    this.name = 'FeedbackError'
    this.code = code
  }
}

const ERROR_MESSAGES: Readonly<Record<FeedbackErrorCode, string>> = {
  'too-frequent': 'Слишком часто: между замечаниями должно пройти полминуты. Подождите и отправьте ещё раз',
  network: 'Нет соединения с сервером. Проверьте сеть и попробуйте ещё раз',
  unknown: 'Не удалось отправить замечание. Попробуйте ещё раз позже',
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
}

/** Понятный текст ошибки отправки (форма показывает его как есть). */
export function feedbackErrorMessage(cause: unknown): string {
  if (cause instanceof FeedbackError) return cause.message
  const code = errorCode(cause).toLowerCase()
  const text = cause instanceof Error ? cause.message.toLowerCase() : ''
  // Данные уже проверены в форме, поэтому отказ правил почти всегда означает ограничение частоты.
  if (code.includes('permission') || text.includes('permission_denied') || text.includes('permission denied')) {
    return ERROR_MESSAGES['too-frequent']
  }
  if (code === 'auth/network-request-failed' || text.includes('network')) return ERROR_MESSAGES.network
  if (code === 'auth/operation-not-allowed') return 'Отправка замечаний пока не настроена (анонимный вход выключен в Firebase)'
  return ERROR_MESSAGES.unknown
}

export function feedbackError(code: FeedbackErrorCode): FeedbackError {
  return new FeedbackError(code, ERROR_MESSAGES[code])
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(feedbackError('network')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (cause: unknown) => {
        clearTimeout(timer)
        reject(cause instanceof Error ? cause : new Error(String(cause)))
      },
    )
  })
}

/**
 * Отправляет замечание одним многопутевым `update`: запись и отметка времени отправки в `feedbackLimits`.
 * Правила базы принимают запись, только если в том же запросе отметка равна времени сервера и прошлая
 * отметка старше 30 секунд, а в отметке указан id именно этой записи (одна запись на запрос).
 * Возвращает id новой записи.
 */
export async function sendFeedback(draft: FeedbackDraft, uid: string): Promise<string> {
  const { db, dbApi } = await loadFirebase()
  const id = dbApi.push(dbApi.ref(db, FEEDBACK_PATH)).key
  if (!id) throw feedbackError('unknown')
  const at = dbApi.serverTimestamp()
  await withTimeout(
    dbApi.update(dbApi.ref(db), {
      [`${FEEDBACK_PATH}/${id}`]: buildFeedbackRecord(draft, uid, APP_VERSION, at),
      [feedbackLimitPath(uid)]: { at, item: id },
    }),
    SEND_TIMEOUT_MS,
  )
  return id
}

/** Замечания автора, новые сверху. Запрос по uid — единственный, который правила разрешают автору. */
export async function fetchMyFeedback(uid: string): Promise<FeedbackItem[]> {
  const { db, dbApi } = await loadFirebase()
  const snap = await dbApi.get(dbApi.query(dbApi.ref(db, FEEDBACK_PATH), dbApi.orderByChild('uid'), dbApi.equalTo(uid)))
  return parseFeedbackList(snap.val())
}

/** Все замечания для администратора, новые сверху. */
export async function fetchAllFeedback(): Promise<FeedbackItem[]> {
  const { db, dbApi } = await loadFirebase()
  const snap = await dbApi.get(
    dbApi.query(dbApi.ref(db, FEEDBACK_PATH), dbApi.orderByChild('createdAt'), dbApi.limitToLast(ADMIN_LIST_LIMIT)),
  )
  return parseFeedbackList(snap.val())
}

/** Меняет статус и (или) заметку администратора; пустая заметка удаляется. */
export async function updateFeedback(id: string, patch: { status?: FeedbackStatus; adminNote?: string }): Promise<void> {
  const { db, dbApi } = await loadFirebase()
  const values: Record<string, string | null> = {}
  if (patch.status) values.status = patch.status
  if (patch.adminNote !== undefined) values.adminNote = patch.adminNote.trim() || null
  await dbApi.update(dbApi.ref(db, `${FEEDBACK_PATH}/${id}`), values)
}

export async function deleteFeedback(id: string): Promise<void> {
  const { db, dbApi } = await loadFirebase()
  await dbApi.remove(dbApi.ref(db, `${FEEDBACK_PATH}/${id}`))
}
