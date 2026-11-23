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
  variantsTaken: [1],
  lastVariant: 1,
  activeVariant: null,
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
      variantsTaken: [],
      lastVariant: null,
      activeVariant: null,
    })
    expect(store.levels).toEqual({})
  })

  describe('варианты теста', () => {
    // Случайность фиксируется: всегда первый кандидат.
    const first = () => 0

    it('с одним вариантом всегда отдаёт первый и не создаёт запись', () => {
      const store = useProgressStore()

      expect(store.startQuiz('vue-middle', 1)).toBe(0)
      expect(store.levels).toEqual({})
    })

    it('начатый вариант не меняется до проверки, после проверки выбирается непройденный', () => {
      const store = useProgressStore()

      expect(store.startQuiz('vue-middle', 3, first)).toBe(0)
      expect(store.startQuiz('vue-middle', 3, () => 0.99)).toBe(0)
      store.recordQuizResult('vue-middle', 50, 0)

      expect(store.getLevel('vue-middle')).toMatchObject({ variantsTaken: [0], lastVariant: 0, activeVariant: null })
      expect(store.startQuiz('vue-middle', 3, first)).toBe(1)
      store.recordQuizResult('vue-middle', 60, 1)
      expect(store.startQuiz('vue-middle', 3, first)).toBe(2)
    })

    it('когда пройдены все, начинает новый круг не с последнего варианта', () => {
      const store = useProgressStore()
      for (const variant of [0, 1, 2]) {
        store.startQuiz('vue-middle', 3, first)
        store.recordQuizResult('vue-middle', 90, variant)
      }

      // Последним был вариант 2, первый кандидат нового круга — 0; с random около 1 — 1, но не 2.
      expect(store.startQuiz('vue-middle', 3, () => 0.99)).toBe(1)
      expect(store.getLevel('vue-middle').variantsTaken).toEqual([])
    })

    it('выбирает заново, если начатого варианта больше нет', () => {
      const store = useProgressStore()
      store.startQuiz('vue-middle', 5, () => 0.99)

      expect(store.getLevel('vue-middle').activeVariant).toBe(4)
      expect(store.startQuiz('vue-middle', 2, first)).toBe(0)
    })

    it('читает старый прогресс без полей вариантов', () => {
      const old = { seenTopics: validLevel.seenTopics, bestScore: 90, lastScore: 70, attempts: 2, passedAt: validLevel.passedAt }
      localStorage.setItem('vue-interview-prep:progress', JSON.stringify({ version: 1, levels: { a: old }, lastVisited: null }))
      const store = useProgressStore()

      expect(store.getLevel('a')).toEqual({ ...old, variantsTaken: [], lastVariant: null, activeVariant: null })
    })
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
