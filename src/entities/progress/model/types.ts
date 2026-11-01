export type LevelProgress = {
  /** Sorted unique topic indexes. */
  seenTopics: number[]
  /** Percent 0..100. */
  bestScore: number | null
  lastScore: number | null
  attempts: number
  /** ISO date of the first result >= PASS_SCORE. */
  passedAt: string | null
}

export type LastVisited = { levelId: string; step: number | 'quiz' }

/** Everything that makes up the user's progress; the unit stored locally and synced between devices. */
export type ProgressSnapshot = { levels: Record<string, LevelProgress>; lastVisited: LastVisited | null }
