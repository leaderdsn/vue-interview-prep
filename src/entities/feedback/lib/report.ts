import { FEEDBACK_IMAGE_LIMITS, FEEDBACK_IMAGE_PREFIXES, FEEDBACK_KINDS, FEEDBACK_LIMITS, FEEDBACK_STATUSES } from '../config/feedback'

import type { FeedbackContext, FeedbackDraft, FeedbackItem, FeedbackKind, FeedbackRecord, FeedbackStatus } from '../model/types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Обрезает строку до лимита, ставя многоточие, чтобы было видно, что текст длиннее. */
function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** Цитата из выделения: пробелы и переносы схлопываются, длина — не больше лимита правил базы. */
export function normalizeQuote(raw: string): string {
  return clip(raw.replace(/\s+/g, ' ').trim(), FEEDBACK_LIMITS.quote)
}

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === 'string' && (FEEDBACK_KINDS as string[]).includes(value)
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === 'string' && (FEEDBACK_STATUSES as string[]).includes(value)
}

/** Ошибки заполнения формы; пустой список — можно отправлять. Те же условия проверяют правила базы. */
export function feedbackIssues(draft: Pick<FeedbackDraft, 'kind' | 'text' | 'email'>): string[] {
  const issues: string[] = []
  const text = draft.text.trim()
  const email = draft.email.trim()
  if (!isFeedbackKind(draft.kind)) issues.push('Выберите тип замечания')
  if (text.length < FEEDBACK_LIMITS.textMin) issues.push(`Опишите замечание: хотя бы ${FEEDBACK_LIMITS.textMin} символов`)
  if (text.length > FEEDBACK_LIMITS.textMax) issues.push(`Слишком длинный текст: не больше ${FEEDBACK_LIMITS.textMax} символов`)
  if (email && (email.length > FEEDBACK_LIMITS.email || !EMAIL_PATTERN.test(email))) issues.push('Проверьте адрес почты')
  return issues
}

/** Строка data URL допустимого типа и размера — такую примут правила базы и можно показать в `<img src>`. */
export function isFeedbackImage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= FEEDBACK_IMAGE_LIMITS.maxLength &&
    FEEDBACK_IMAGE_PREFIXES.some((prefix) => value.startsWith(prefix) && value.length > prefix.length)
  )
}

/** Картинки для отправки: только допустимые и не больше двух. */
export function cleanFeedbackImages(images: readonly string[] = []): string[] {
  return images.filter(isFeedbackImage).slice(0, FEEDBACK_IMAGE_LIMITS.maxCount)
}

/**
 * Значение узла `feedbackImages/<id>` для записи: `{ 0: dataUrl, 1: dataUrl }`; null — картинок нет.
 * Ключи — строки, как в правилах базы.
 */
export function feedbackImagesValue(images: readonly string[]): Record<string, string> | null {
  const clean = cleanFeedbackImages(images)
  return clean.length ? Object.fromEntries(clean.map((image, index) => [String(index), image])) : null
}

/**
 * Картинки из снимка базы. SDK отдаёт узел с ключами 0 и 1 массивом, а с одним ключом 1 — объектом,
 * поэтому подходят оба вида. Всё, что не похоже на допустимый data URL, отбрасывается.
 */
export function parseFeedbackImages(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return []
  const values = Array.isArray(raw)
    ? (raw as unknown[])
    : Object.entries(raw as Record<string, unknown>)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, value]) => value)
  return values.filter(isFeedbackImage).slice(0, FEEDBACK_IMAGE_LIMITS.maxCount)
}

/** Контекст без пустых полей и с длинами в пределах правил базы. */
function cleanContext(context: FeedbackContext): FeedbackContext {
  const result: FeedbackContext = { page: clip(context.page || '/', FEEDBACK_LIMITS.page) }
  if (context.levelId) result.levelId = clip(context.levelId, FEEDBACK_LIMITS.levelId)
  if (context.step === 'quiz' || (Number.isInteger(context.step) && Number(context.step) >= 1)) result.step = context.step
  if (context.topicTitle) result.topicTitle = clip(context.topicTitle, FEEDBACK_LIMITS.topicTitle)
  if (Number.isInteger(context.questionIndex) && Number(context.questionIndex) >= 0) result.questionIndex = context.questionIndex
  if (context.questionText) result.questionText = clip(context.questionText, FEEDBACK_LIMITS.questionText)
  const quote = context.quote ? normalizeQuote(context.quote) : ''
  if (quote) result.quote = quote
  return result
}

/**
 * Запись для базы. `createdAt` — метка времени сервера (`serverTimestamp()`), поэтому её тип задаёт вызывающий.
 * Поля undefined база не принимает, поэтому их здесь нет вовсе.
 */
export function buildFeedbackRecord<T>(
  draft: FeedbackDraft,
  uid: string,
  appVersion: string,
  createdAt: T,
): Omit<FeedbackRecord, 'createdAt'> & { createdAt: T } {
  const email = draft.email.trim()
  return {
    kind: draft.kind,
    text: draft.text.trim(),
    ...(email ? { email } : {}),
    ...cleanContext(draft.context),
    appVersion: clip(appVersion, FEEDBACK_LIMITS.appVersion),
    createdAt,
    uid,
    status: 'new',
    imageCount: cleanFeedbackImages(draft.images).length,
  }
}

const optionalString = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/** Запись из базы; null, если она повреждена. */
export function parseFeedbackItem(id: string, raw: unknown): FeedbackItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (!isFeedbackKind(value.kind) || !isFeedbackStatus(value.status)) return null
  if (typeof value.text !== 'string' || typeof value.uid !== 'string' || typeof value.createdAt !== 'number') return null
  const item: FeedbackItem = {
    id,
    kind: value.kind,
    text: value.text,
    page: typeof value.page === 'string' ? value.page : '/',
    appVersion: typeof value.appVersion === 'string' ? value.appVersion : '',
    createdAt: value.createdAt,
    uid: value.uid,
    status: value.status,
  }
  const strings = ['email', 'levelId', 'topicTitle', 'questionText', 'quote', 'adminNote'] as const
  for (const key of strings) {
    const text = optionalString(value[key])
    if (text !== undefined) item[key] = text
  }
  if (value.step === 'quiz' || typeof value.step === 'number') item.step = value.step
  if (typeof value.questionIndex === 'number') item.questionIndex = value.questionIndex
  if (typeof value.imageCount === 'number' && value.imageCount > 0) {
    item.imageCount = Math.min(Math.floor(value.imageCount), FEEDBACK_IMAGE_LIMITS.maxCount)
  }
  return item
}

/** Список из снимка базы (`{ <id>: запись }`), новые сверху; повреждённые записи отбрасываются. */
export function parseFeedbackList(raw: unknown): FeedbackItem[] {
  if (typeof raw !== 'object' || raw === null) return []
  return Object.entries(raw as Record<string, unknown>)
    .map(([id, value]) => parseFeedbackItem(id, value))
    .filter((item): item is FeedbackItem => item !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Где оставлено замечание, коротко: «vue-junior · тема 3 «Заголовок»» или «Общее предложение». */
export function describeContext(context: FeedbackContext): string {
  if (!context.levelId) return context.page === '/' ? 'Главная страница' : `Страница ${context.page}`
  if (context.step === 'quiz') {
    const question = context.questionIndex === undefined ? '' : `, вопрос ${context.questionIndex + 1}`
    return `${context.levelId} · тест${question}`
  }
  const topic = context.step === undefined ? '' : ` · тема ${context.step}`
  const title = context.topicTitle ? ` «${context.topicTitle}»` : ''
  return `${context.levelId}${topic}${title}`
}
