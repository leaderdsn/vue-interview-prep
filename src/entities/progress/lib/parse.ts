import type { LastVisited, LevelProgress } from '../model/types'

export function createEmptyLevel(): LevelProgress {
  return { seenTopics: [], bestScore: null, lastScore: null, attempts: 0, passedAt: null }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function parseScore(value: unknown): number | null | undefined {
  if (value === null) return null
  return isPercent(value) ? value : undefined
}

/** Возвращает очищенную запись или null, если исходное значение некорректно. */
export function parseLevel(raw: unknown): LevelProgress | null {
  if (!isRecord(raw)) return null
  const { seenTopics, bestScore, lastScore, attempts, passedAt } = raw

  if (!Array.isArray(seenTopics) || !seenTopics.every((i) => Number.isInteger(i) && i >= 0)) return null
  const best = parseScore(bestScore)
  const last = parseScore(lastScore)
  if (best === undefined || last === undefined) return null
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0) return null
  if (passedAt !== null && (typeof passedAt !== 'string' || Number.isNaN(Date.parse(passedAt)))) return null

  return {
    seenTopics: [...new Set(seenTopics as number[])].sort((a, b) => a - b),
    bestScore: best,
    lastScore: last,
    attempts,
    passedAt,
  }
}

export function parseLastVisited(raw: unknown): LastVisited | null {
  if (!isRecord(raw) || typeof raw.levelId !== 'string' || !raw.levelId) return null
  const { step } = raw
  if (step === 'quiz' || (typeof step === 'number' && Number.isInteger(step) && step >= 0)) {
    return { levelId: raw.levelId, step }
  }
  return null
}

export function parseLevels(raw: unknown): Record<string, LevelProgress> {
  const result: Record<string, LevelProgress> = {}
  if (!isRecord(raw)) return result
  for (const [id, value] of Object.entries(raw)) {
    const level = parseLevel(value)
    if (level) result[id] = level
  }
  return result
}
