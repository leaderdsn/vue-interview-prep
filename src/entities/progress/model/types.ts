export type LevelProgress = {
  /** Отсортированные уникальные индексы тем. */
  seenTopics: number[]
  /** Процент 0..100. */
  bestScore: number | null
  lastScore: number | null
  attempts: number
  /** ISO-дата первого результата >= PASS_SCORE. */
  passedAt: string | null
}

export type LastVisited = { levelId: string; step: number | 'quiz' }

/** Весь прогресс пользователя; единица, которая хранится локально и синхронизируется между устройствами. */
export type ProgressSnapshot = { levels: Record<string, LevelProgress>; lastVisited: LastVisited | null }
