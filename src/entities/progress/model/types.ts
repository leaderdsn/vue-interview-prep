export type LevelProgress = {
  /** Отсортированные уникальные индексы тем. */
  seenTopics: number[]
  /** Процент 0..100. */
  bestScore: number | null
  lastScore: number | null
  attempts: number
  /** ISO-дата первого результата >= PASS_SCORE. */
  passedAt: string | null
  /** Номера вариантов теста (с 0), пройденных в текущем круге; когда пройдены все, круг начинается заново. */
  variantsTaken: number[]
  /** Вариант последнего проверенного теста: новый круг начинается не с него. */
  lastVariant: number | null
  /** Вариант начатого и ещё не проверенного теста: обновление страницы не меняет вопросы. */
  activeVariant: number | null
}

export type LastVisited = { levelId: string; step: number | 'quiz' }

/** Весь прогресс пользователя; единица, которая хранится локально и синхронизируется между устройствами. */
export type ProgressSnapshot = { levels: Record<string, LevelProgress>; lastVisited: LastVisited | null }
