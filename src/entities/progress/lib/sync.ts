import { createEmptyLevel, isRecord, parseLastVisited, parseLevel } from './parse'

import type { LevelProgress, ProgressSnapshot } from '../model/types'

/**
 * Читает прогресс, сохранённый в Firebase Realtime Database. База отбрасывает пустые массивы и null,
 * поэтому перед валидацией отсутствующие поля восстанавливаются пустыми значениями.
 */
export function parseRemoteProgress(raw: unknown): ProgressSnapshot {
  const levels: Record<string, LevelProgress> = {}
  if (!isRecord(raw)) return { levels, lastVisited: null }

  if (isRecord(raw.levels)) {
    for (const [id, value] of Object.entries(raw.levels)) {
      const level = isRecord(value) ? parseLevel({ ...createEmptyLevel(), ...value }) : null
      if (level) levels[id] = level
    }
  }
  return { levels, lastVisited: parseLastVisited(raw.lastVisited) }
}

function maxScore(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}

function earliestDate(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return Date.parse(a) <= Date.parse(b) ? a : b
}

function mergeLevel(local: LevelProgress, remote: LevelProgress): LevelProgress {
  return {
    seenTopics: [...new Set([...local.seenTopics, ...remote.seenTopics])].sort((a, b) => a - b),
    bestScore: maxScore(local.bestScore, remote.bestScore),
    // сторона с большим числом попыток видела последний тест
    lastScore: remote.attempts > local.attempts ? remote.lastScore : local.lastScore,
    attempts: Math.max(local.attempts, remote.attempts),
    passedAt: earliestDate(local.passedAt, remote.passedAt),
  }
}

/** Объединяет прогресс, набранный на этом устройстве до входа, с прогрессом аккаунта; ничего не теряется. */
export function mergeProgress(local: ProgressSnapshot, remote: ProgressSnapshot): ProgressSnapshot {
  const levels: Record<string, LevelProgress> = { ...remote.levels }
  for (const [id, level] of Object.entries(local.levels)) {
    const other = remote.levels[id]
    levels[id] = other ? mergeLevel(level, other) : level
  }
  return { levels, lastVisited: local.lastVisited ?? remote.lastVisited }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  )
}

/** Порядок ключей в базе и в локальном состоянии различается, поэтому сравниваем канонический JSON. */
export function isSameProgress(a: ProgressSnapshot, b: ProgressSnapshot): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
}
