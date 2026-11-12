import type { FeedbackKind, FeedbackStatus } from '../model/types'

/** Замечания: создать может любой вошедший (и анонимный) аккаунт, читать — администратор и автор. */
export const FEEDBACK_PATH = 'interviewPrep/feedback'

/** Время последней отправки аккаунта: по нему правила базы ограничивают частоту. */
export const feedbackLimitPath = (uid: string) => `interviewPrep/feedbackLimits/${uid}`

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
