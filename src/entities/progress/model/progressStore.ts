import { defineStore } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import { PASS_SCORE, PROGRESS_STORAGE_KEY, PROGRESS_VERSION } from '../config/storage'
import { createEmptyLevel, isRecord, parseLastVisited, parseLevel, parseLevels } from '../lib/parse'

import type { LastVisited, LevelProgress, ProgressSnapshot } from './types'

type Persisted = ProgressSnapshot & { version: number }

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
    // Хранилище может быть недоступно (приватный режим) — прогресс всё равно живёт в рамках сессии.
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

  /**
   * Сколько из `topicCount` тем уровня прочитано. Номера тем не меньше `topicCount` не считаются: тему могли удалить
   * правкой из админки, а на главной число тем берётся из индекса. Поэтому прогресс не превышает 100 %.
   */
  function seenCount(levelId: string, topicCount: number): number {
    return getLevel(levelId).seenTopics.filter((index) => index < topicCount).length
  }

  /** Доля прочитанных тем уровня в процентах (0–100). */
  function topicsPercent(levelId: string, topicCount: number): number {
    return topicCount > 0 ? Math.round((seenCount(levelId, topicCount) / topicCount) * 100) : 0
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

  /** Отвязанная копия, которую безопасно отправлять по сети или сравнивать. */
  function snapshot(): ProgressSnapshot {
    return structuredClone({ levels: toRaw(levels.value), lastVisited: toRaw(lastVisited.value) })
  }

  function applySnapshot(value: ProgressSnapshot) {
    levels.value = structuredClone(value.levels)
    lastVisited.value = value.lastVisited ? { ...value.lastVisited } : null
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
    seenCount,
    topicsPercent,
    markTopicSeen,
    recordQuizResult,
    setLastVisited,
    resetLevel,
    resetAll,
    snapshot,
    applySnapshot,
    exportJson,
    importJson,
  }
})
