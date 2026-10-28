import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { PASS_SCORE, PROGRESS_STORAGE_KEY, PROGRESS_VERSION } from '../config/storage'

import type { LastVisited, LevelProgress } from './types'

type Persisted = { version: number; levels: Record<string, LevelProgress>; lastVisited: LastVisited | null }

function createEmptyLevel(): LevelProgress {
  return { seenTopics: [], bestScore: null, lastScore: null, attempts: 0, passedAt: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function parseScore(value: unknown): number | null | undefined {
  if (value === null) return null
  return isPercent(value) ? value : undefined
}

/** Returns a clean entry or null when the raw value is malformed. */
function parseLevel(raw: unknown): LevelProgress | null {
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

function parseLastVisited(raw: unknown): LastVisited | null {
  if (!isRecord(raw) || typeof raw.levelId !== 'string' || !raw.levelId) return null
  const { step } = raw
  if (step === 'quiz' || (typeof step === 'number' && Number.isInteger(step) && step >= 0)) {
    return { levelId: raw.levelId, step }
  }
  return null
}

function parseLevels(raw: unknown): Record<string, LevelProgress> {
  const result: Record<string, LevelProgress> = {}
  if (!isRecord(raw)) return result
  for (const [id, value] of Object.entries(raw)) {
    const level = parseLevel(value)
    if (level) result[id] = level
  }
  return result
}

function readStored(): Persisted | null {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || data.version !== PROGRESS_VERSION) return null
    return {
      version: PROGRESS_VERSION,
      levels: parseLevels(data.levels),
      lastVisited: parseLastVisited(data.lastVisited),
    }
  } catch {
    return null
  }
}

function store(payload: Persisted) {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage may be unavailable (private mode) — progress still lives for the session.
  }
}

export const useProgressStore = defineStore('progress', () => {
  const stored = readStored()
  const levels = ref<Record<string, LevelProgress>>(stored?.levels ?? {})
  const lastVisited = ref<LastVisited | null>(stored?.lastVisited ?? null)

  function payload(): Persisted {
    return { version: PROGRESS_VERSION, levels: levels.value, lastVisited: lastVisited.value }
  }

  watch([levels, lastVisited], () => store(payload()), { deep: true })

  function getLevel(levelId: string): LevelProgress {
    return levels.value[levelId] ?? createEmptyLevel()
  }

  function ensureLevel(levelId: string): LevelProgress {
    return (levels.value[levelId] ??= createEmptyLevel())
  }

  function markTopicSeen(levelId: string, topicIndex: number) {
    const level = ensureLevel(levelId)
    if (level.seenTopics.includes(topicIndex)) return
    level.seenTopics = [...level.seenTopics, topicIndex].sort((a, b) => a - b)
  }

  function recordQuizResult(levelId: string, percent: number) {
    const level = ensureLevel(levelId)
    level.attempts += 1
    level.lastScore = percent
    level.bestScore = Math.max(level.bestScore ?? 0, percent)
    if (percent >= PASS_SCORE && level.passedAt === null) level.passedAt = new Date().toISOString()
  }

  function setLastVisited(value: LastVisited) {
    lastVisited.value = { ...value }
  }

  function resetLevel(levelId: string) {
    delete levels.value[levelId]
    if (lastVisited.value?.levelId === levelId) lastVisited.value = null
  }

  function resetAll() {
    levels.value = {}
    lastVisited.value = null
  }

  function exportJson(): string {
    return JSON.stringify(payload(), null, 2)
  }

  function importJson(json: string) {
    let data: unknown
    try {
      data = JSON.parse(json)
    } catch {
      throw new Error('Файл не является корректным JSON')
    }
    if (!isRecord(data) || data.version !== PROGRESS_VERSION || !isRecord(data.levels)) {
      throw new Error('Неверный формат файла прогресса')
    }

    const parsed: Record<string, LevelProgress> = {}
    for (const [id, value] of Object.entries(data.levels)) {
      const level = parseLevel(value)
      if (!level) throw new Error(`Некорректные данные прогресса для уровня «${id}»`)
      parsed[id] = level
    }

    levels.value = parsed
    lastVisited.value = parseLastVisited(data.lastVisited)
  }

  return {
    levels,
    lastVisited,
    getLevel,
    markTopicSeen,
    recordQuizResult,
    setLastVisited,
    resetLevel,
    resetAll,
    exportJson,
    importJson,
  }
})
