import type { FeedbackKind, FeedbackStatus } from '../model/types'

/** Замечания: создать может любой вошедший (и анонимный) аккаунт, читать — администратор и автор. */
export const FEEDBACK_PATH = 'interviewPrep/feedback'

/** Время последней отправки аккаунта: по нему правила базы ограничивают частоту. */
export const feedbackLimitPath = (uid: string) => `interviewPrep/feedbackLimits/${uid}`

/**
 * Картинки замечаний: `interviewPrep/feedbackImages/<feedbackId>/<0|1>` — строки data URL.
 * Отдельная ветка, чтобы список замечаний грузился без картинок. Читают администратор и автор.
 */
export const FEEDBACK_IMAGES_PATH = 'interviewPrep/feedbackImages'

export const feedbackImagesPath = (id: string) => `${FEEDBACK_IMAGES_PATH}/${id}`

/** Ограничения картинок; `maxCount`, `maxLength` и список типов совпадают с database.rules.json. */
export const FEEDBACK_IMAGE_LIMITS = {
  /** Не больше двух картинок на замечание. */
  maxCount: 2,
  /** Длинная сторона после уменьшения, px. */
  maxSide: 1600,
  /** Длина строки data URL: около 300 КБ данных в base64. */
  maxLength: 400_000,
  /** Качество WebP (или JPEG) при перекодировании. */
  quality: 0.8,
  /** Второй, последний заход, если картинка не уложилась в размер. */
  fallbackQuality: 0.6,
} as const

/** Допустимые начала data URL: только растровые форматы, SVG может содержать скрипты. */
export const FEEDBACK_IMAGE_PREFIXES = ['data:image/webp;base64,', 'data:image/png;base64,', 'data:image/jpeg;base64,'] as const

/** Минимальный промежуток между замечаниями одного аккаунта; то же число стоит в database.rules.json. */
export const FEEDBACK_INTERVAL_MS = 30_000

/** Ограничения длины; совпадают с `.validate` в database.rules.json. */
export const FEEDBACK_LIMITS = {
  textMin: 5,
  textMax: 2000,
  email: 254,
  page: 300,
  levelId: 100,
  topicTitle: 300,
  questionText: 1000,
  quote: 300,
  appVersion: 50,
  adminNote: 2000,
} as const

export const FEEDBACK_KIND_LABELS: Readonly<Record<FeedbackKind, string>> = {
  typo: 'Опечатка',
  inaccuracy: 'Неточность или ошибка',
  outdated: 'Устарело',
  quiz: 'Ошибка в тесте',
  suggestion: 'Предложение',
}

export const FEEDBACK_STATUS_LABELS: Readonly<Record<FeedbackStatus, string>> = {
  new: 'Новое',
  in_progress: 'В работе',
  fixed: 'Исправлено',
  rejected: 'Отклонено',
}

export const FEEDBACK_KINDS = Object.keys(FEEDBACK_KIND_LABELS) as FeedbackKind[]
export const FEEDBACK_STATUSES = Object.keys(FEEDBACK_STATUS_LABELS) as FeedbackStatus[]
