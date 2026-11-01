import { describe, expect, it } from 'vitest'

import { isSameProgress, mergeProgress, parseRemoteProgress } from './sync'

import type { LevelProgress, ProgressSnapshot } from '../model/types'

const level = (patch: Partial<LevelProgress> = {}): LevelProgress => ({
  seenTopics: [],
  bestScore: null,
  lastScore: null,
  attempts: 0,
  passedAt: null,
  ...patch,
})

const snapshot = (levels: Record<string, LevelProgress>, lastVisited: ProgressSnapshot['lastVisited'] = null) => ({
  levels,
  lastVisited,
})

describe('parseRemoteProgress', () => {
  it('возвращает пустой прогресс для отсутствующих данных', () => {
    expect(parseRemoteProgress(null)).toEqual(snapshot({}))
  })

  it('восстанавливает пустые массивы и null, которые база не хранит', () => {
    const remote = parseRemoteProgress({ levels: { 'vue-junior': { attempts: 1, lastScore: 40, bestScore: 40 } } })

    expect(remote).toEqual(snapshot({ 'vue-junior': level({ attempts: 1, lastScore: 40, bestScore: 40 }) }))
  })

  it('пропускает повреждённые уровни и читает место остановки', () => {
    const remote = parseRemoteProgress({
      levels: { good: { seenTopics: [1], attempts: 0 }, bad: { attempts: -1 }, junk: 5 },
      lastVisited: { levelId: 'good', step: 'quiz' },
    })

    expect(remote).toEqual(snapshot({ good: level({ seenTopics: [1] }) }, { levelId: 'good', step: 'quiz' }))
  })
})

describe('mergeProgress', () => {
  it('объединяет уровни с обеих сторон, ничего не теряя', () => {
    const local = snapshot({
      a: level({ seenTopics: [0, 2], bestScore: 70, lastScore: 70, attempts: 1 }),
      onlyLocal: level({ seenTopics: [1] }),
    })
    const remote = snapshot({
      a: level({
        seenTopics: [1, 2],
        bestScore: 90,
        lastScore: 50,
        attempts: 3,
        passedAt: '2026-02-01T00:00:00.000Z',
      }),
      onlyRemote: level({ attempts: 1, lastScore: 10, bestScore: 10 }),
    })

    expect(mergeProgress(local, remote).levels).toEqual({
      a: level({ seenTopics: [0, 1, 2], bestScore: 90, lastScore: 50, attempts: 3, passedAt: '2026-02-01T00:00:00.000Z' }),
      onlyLocal: level({ seenTopics: [1] }),
      onlyRemote: level({ attempts: 1, lastScore: 10, bestScore: 10 }),
    })
  })

  it('берёт самую раннюю дату прохождения и локальное место остановки', () => {
    const local = snapshot({ a: level({ passedAt: '2026-03-01T00:00:00.000Z' }) }, { levelId: 'a', step: 2 })
    const remote = snapshot({ a: level({ passedAt: '2026-01-01T00:00:00.000Z' }) }, { levelId: 'b', step: 0 })

    const merged = mergeProgress(local, remote)

    expect(merged.levels.a?.passedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(merged.lastVisited).toEqual({ levelId: 'a', step: 2 })
    expect(mergeProgress(snapshot({}), remote).lastVisited).toEqual({ levelId: 'b', step: 0 })
  })
})

describe('isSameProgress', () => {
  it('не зависит от порядка ключей', () => {
    const a = snapshot({ x: level({ attempts: 1 }), y: level() })
    const b = snapshot({ y: level(), x: { passedAt: null, attempts: 1, lastScore: null, bestScore: null, seenTopics: [] } })

    expect(isSameProgress(a, b)).toBe(true)
    expect(isSameProgress(a, snapshot({ x: level({ attempts: 2 }), y: level() }))).toBe(false)
  })
})
