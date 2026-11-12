import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { PROGRESS_STORAGE_KEY } from '../config/storage'

import { useProgressStore } from './progressStore'

const validLevel = {
  seenTopics: [0, 2],
  bestScore: 90,
  lastScore: 70,
  attempts: 2,
  passedAt: '2026-01-01T00:00:00.000Z',
}

describe('useProgressStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('возвращает пустой прогресс, не создавая запись', () => {
    const store = useProgressStore()

    expect(store.getLevel('vue-middle')).toEqual({
      seenTopics: [],
      bestScore: null,
      lastScore: null,
      attempts: 0,
      passedAt: null,
    })
    expect(store.levels).toEqual({})
  })

  it('отмечает темы как просмотренные без дублей и по порядку', () => {
    const store = useProgressStore()

    store.markTopicSeen('vue-middle', 3)
    store.markTopicSeen('vue-middle', 1)
    store.markTopicSeen('vue-middle', 3)

    expect(store.getLevel('vue-middle').seenTopics).toEqual([1, 3])
  })

  it.each([
    { results: [50], best: 50, last: 50, passed: false },
    { results: [60, 40], best: 60, last: 40, passed: false },
    { results: [80], best: 80, last: 80, passed: true },
    { results: [90, 30], best: 90, last: 30, passed: true },
  ])('учитывает результаты $results', ({ results, best, last, passed }) => {
    const store = useProgressStore()

    results.forEach((percent) => store.recordQuizResult('vue-middle', percent))
    const level = store.getLevel('vue-middle')

    expect(level.attempts).toBe(results.length)
    expect(level.bestScore).toBe(best)
    expect(level.lastScore).toBe(last)
    expect(level.passedAt !== null).toBe(passed)
  })

  it('считает прочитанные темы только в пределах числа тем уровня, не больше 100 %', () => {
    const store = useProgressStore()
    // Темы 4 и 5 были в правке из базы, потом их удалили: в прогрессе номера остались.
    for (const index of [0, 1, 4, 5]) store.markTopicSeen('vue-middle', index)

    expect(store.seenCount('vue-middle', 4)).toBe(2)
    expect(store.topicsPercent('vue-middle', 4)).toBe(50)
    expect(store.seenCount('vue-middle', 2)).toBe(2)
    expect(store.topicsPercent('vue-middle', 2)).toBe(100)
    expect(store.topicsPercent('vue-middle', 0)).toBe(0)
    expect(store.seenCount('нет-уровня', 4)).toBe(0)
  })

  it('фиксирует дату первого прохождения один раз', () => {
    const store = useProgressStore()

    store.recordQuizResult('vue-middle', 85)
    const first = store.getLevel('vue-middle').passedAt
    store.recordQuizResult('vue-middle', 95)

    expect(store.getLevel('vue-middle').passedAt).toBe(first)
  })

  it('сбрасывает уровень и всё сразу', () => {
    const store = useProgressStore()
    store.markTopicSeen('a', 0)
    store.markTopicSeen('b', 0)
    store.setLastVisited({ levelId: 'a', step: 'quiz' })

    store.resetLevel('a')
    expect(Object.keys(store.levels)).toEqual(['b'])
    expect(store.lastVisited).toBeNull()

    store.resetAll()
    expect(store.levels).toEqual({})
  })

  it('сохраняет состояние в localStorage и восстанавливает его', async () => {
    const store = useProgressStore()
    store.markTopicSeen('vue-middle', 1)
    store.setLastVisited({ levelId: 'vue-middle', step: 2 })
    await nextTick()

    expect(JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY)!).version).toBe(1)

    setActivePinia(createPinia())
    const restored = useProgressStore()

    expect(restored.getLevel('vue-middle').seenTopics).toEqual([1])
    expect(restored.lastVisited).toEqual({ levelId: 'vue-middle', step: 2 })
  })

  it('отбрасывает повреждённые записи при чтении', () => {
    localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        levels: { good: validLevel, bad: { seenTopics: 'x' }, worse: 5, range: { ...validLevel, bestScore: 150 } },
        lastVisited: { levelId: 'good', step: -1 },
      }),
    )

    const store = useProgressStore()

    expect(Object.keys(store.levels)).toEqual(['good'])
    expect(store.lastVisited).toBeNull()
  })

  it.each(['{не json', '42', JSON.stringify({ version: 2, levels: {} })])(
    'не падает на мусоре в хранилище: %s',
    (raw) => {
      localStorage.setItem(PROGRESS_STORAGE_KEY, raw)

      expect(useProgressStore().levels).toEqual({})
    },
  )

  describe('экспорт и импорт', () => {
    it('переносит состояние через JSON', () => {
      const source = useProgressStore()
      source.recordQuizResult('vue-middle', 90)
      source.setLastVisited({ levelId: 'vue-middle', step: 'quiz' })
      const json = source.exportJson()

      setActivePinia(createPinia())
      localStorage.clear()
      const target = useProgressStore()
      target.importJson(json)

      expect(target.getLevel('vue-middle').bestScore).toBe(90)
      expect(target.lastVisited).toEqual({ levelId: 'vue-middle', step: 'quiz' })
    })

    it.each([
      ['не JSON', 'abc'],
      ['не тот объект', '[]'],
      ['другая версия', JSON.stringify({ version: 9, levels: {} })],
      ['нет levels', JSON.stringify({ version: 1 })],
      ['битый уровень', JSON.stringify({ version: 1, levels: { a: { attempts: -1 } } })],
    ])('бросает ошибку: %s', (_name, json) => {
      const store = useProgressStore()
      store.markTopicSeen('keep', 0)

      expect(() => store.importJson(json)).toThrow(/[А-Яа-я]/)
      expect(Object.keys(store.levels)).toEqual(['keep'])
    })
  })

  it('отдаёт независимую копию прогресса и применяет снимок целиком', () => {
    const store = useProgressStore()
    store.markTopicSeen('a', 1)

    const copy = store.snapshot()
    copy.levels.a?.seenTopics.push(5)
    expect(store.getLevel('a').seenTopics).toEqual([1])

    store.applySnapshot({ levels: { b: validLevel }, lastVisited: { levelId: 'b', step: 'quiz' } })
    expect(store.levels).toEqual({ b: validLevel })
    expect(store.lastVisited).toEqual({ levelId: 'b', step: 'quiz' })
  })
})
