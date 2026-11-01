import { createEmptyLevel, isRecord, parseLastVisited, parseLevel } from './parse'

import type { LevelProgress, ProgressSnapshot } from '../model/types'

/**
 * Reads progress stored in Firebase Realtime Database. The database drops empty arrays and nulls,
 * so missing fields are restored to their empty values before validation.
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
    // the side with more attempts has seen the latest quiz
    lastScore: remote.attempts > local.attempts ? remote.lastScore : local.lastScore,
    attempts: Math.max(local.attempts, remote.attempts),
    passedAt: earliestDate(local.passedAt, remote.passedAt),
  }
}

/** Combines progress made on this device before sign-in with the account's progress; nothing is lost. */
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

/** Key order differs between the database and local state, so compare canonical JSON. */
export function isSameProgress(a: ProgressSnapshot, b: ProgressSnapshot): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
}
