/** Тип замечания; список значений повторяют правила базы (database.rules.json). */
export type FeedbackKind = 'typo' | 'inaccuracy' | 'outdated' | 'quiz' | 'suggestion'

/** Статус замечания: новое ставит автор, остальные — администратор. */
export type FeedbackStatus = 'new' | 'in_progress' | 'fixed' | 'rejected'

/** Где оставлено замечание; собирается автоматически и показывается в форме только для чтения. */
export type FeedbackContext = {
  /** Путь страницы в приложении (без base), например `/level/vue-junior/3`. */
  page: string
  levelId?: string
  /** Номер темы (с 1) или 'quiz'. */
  step?: number | 'quiz'
  topicTitle?: string
  /** Индекс вопроса в тесте уровня (как в `level.quiz`). */
  questionIndex?: number
  questionText?: string
  /** Выделенный в теме текст. */
  quote?: string
}

/** То, что заполняет пользователь, плюс контекст. */
export type FeedbackDraft = {
  kind: FeedbackKind
  text: string
  /** Почта для ответа; пустая строка — без ответа. */
  email: string
  context: FeedbackContext
}

/** Запись в базе: `interviewPrep/feedback/<id>`. */
export type FeedbackRecord = FeedbackContext & {
  kind: FeedbackKind
  text: string
  email?: string
  appVersion: string
  /** Время сервера, мс. */
  createdAt: number
  /** Автор (в том числе анонимный аккаунт). */
  uid: string
  status: FeedbackStatus
  /** Заметка администратора, автору не показывается. */
  adminNote?: string
}

export type FeedbackItem = FeedbackRecord & { id: string }
