import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAX_TOPICS } from '../lib/validate'

import { applyOverride, contentPath, parseOverride, resolveOverride } from './overrides'
import { fetchLevel } from './trackApi'

import type { LevelOverride } from './overrides'
import type { Level, QuizQuestion } from '../model/types'
import type * as SharedConfig from '@/shared/config'

const firebase = vi.hoisted(() => ({ value: null as object | null }))

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof SharedConfig>()
  return {
    ...actual,
    env: {
      ...actual.env,
      get firebase() {
        return firebase.value
      },
    },
  }
})

const question = (topic: number): QuizQuestion => ({
  topic,
  type: topic % 2 ? 'practice' : 'theory',
  question: `Вопрос по теме ${topic + 1}?`,
  options: ['а', 'б', 'в', 'г'],
  answer: 2,
  explanation: 'Потому что так.',
})

const level: Level = {
  id: 'vue-junior',
  trackId: 'vue',
  level: 'junior',
  topics: [
    { title: 'Первая', html: '<p>-</p>' },
    { title: 'Вторая', html: '<p>-</p>' },
  ],
  quiz: [question(0)],
}

const override: LevelOverride = {
  quiz: [question(1), question(0), { ...question(1), code: 'const a = 1' }],
  updatedAt: '2026-11-12T10:00:00.000Z',
  updatedBy: 'admin@example.com',
}

describe('parseOverride', () => {
  it('разбирает запись из базы', () => {
    expect(parseOverride(override)).toEqual(override)
  })

  it('заполняет отсутствующие сведения о сохранении', () => {
    expect(parseOverride({ quiz: [] })).toEqual({ quiz: [], updatedAt: '', updatedBy: '' })
  })

  it.each([null, 'x', [], { quiz: 'нет' }, { updatedAt: '2026' }])('не принимает мусор из базы: %j', (raw) => {
    expect(parseOverride(raw)).toBeNull()
  })
})

describe('applyOverride', () => {
  it('подставляет корректный тест и оставляет темы из сборки', () => {
    const result = applyOverride(level, override)

    expect(result.quiz).toEqual(override.quiz)
    expect(result.topics).toBe(level.topics)
  })

  it('отбрасывает лишние поля вопросов', () => {
    const result = applyOverride(level, { ...override, quiz: [{ ...question(0), extra: '<script>' } as QuizQuestion] })

    expect(result.quiz[0]).not.toHaveProperty('extra')
  })

  it('без правки возвращает уровень из сборки', () => {
    expect(applyOverride(level, null)).toBe(level)
  })

  it('не применяет правку с ошибками', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = { ...override, quiz: [question(5)] }

    expect(applyOverride(level, broken)).toBe(level)
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('правка тем', () => {
  const second = { title: 'Вторая', html: '<h3>Раздел</h3>\n<p>-</p>' }
  const topics = [{ title: 'Первая (новая)', html: '<p>Новый текст</p>' }, second]

  it('parseOverride принимает запись только с темами', () => {
    expect(parseOverride({ topics, updatedAt: 'd', updatedBy: 'u' })).toEqual({ topics, updatedAt: 'd', updatedBy: 'u' })
  })

  it('parseOverride читает старую запись только с тестом без поля topics', () => {
    expect(parseOverride({ quiz: override.quiz, updatedAt: 'd', updatedBy: 'u' })).not.toHaveProperty('topics')
  })

  it('подставляет темы и тест из одной записи', () => {
    const result = applyOverride(level, { ...override, topics })

    expect(result.topics).toEqual(topics)
    expect(result.quiz).toEqual(override.quiz)
  })

  it('с правкой только тем оставляет тест из сборки', () => {
    const result = applyOverride(level, { topics, updatedAt: '', updatedBy: '' })

    expect(result.topics).toEqual(topics)
    expect(result.quiz).toBe(level.quiz)
  })

  it('очищает HTML тем из базы', () => {
    const dirty = [{ title: 'Первая', html: '<p onclick="alert(1)">a</p><script>alert(1)</script>' }, second]

    expect(applyOverride(level, { topics: dirty, updatedAt: '', updatedBy: '' }).topics[0]?.html).toBe('<p>a</p>')
  })

  it.each([
    ['пустой список', []],
    [`больше ${MAX_TOPICS} тем`, Array.from({ length: MAX_TOPICS + 1 }, () => second)],
    ['пустой заголовок', [{ title: ' ', html: '<p>a</p>' }, second]],
    ['пустой HTML', [{ title: 'a', html: '' }, second]],
    ['HTML, пустой после очистки', [{ title: 'a', html: '<script>alert(1)</script>' }, second]],
  ])('не применяет некорректные темы: %s, но применяет тест', (_, broken) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = applyOverride(level, { ...override, topics: broken })

    expect(result.topics).toBe(level.topics)
    expect(result.quiz).toEqual(override.quiz)
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('правка с другим числом тем', () => {
  const topic = (title: string) => ({ title, html: `<p>${title}</p>` })
  const three = [topic('Первая'), topic('Новая'), topic('Вторая')]
  const meta = { updatedAt: '', updatedBy: '' }

  it('применяет темы и тест, если тест ссылается на новые темы', () => {
    const quiz = [question(0), { ...question(1), topic: 2 }]

    const resolved = resolveOverride(level, { topics: three, quiz, ...meta })

    expect(resolved).toMatchObject({ topicsApplied: true, quizApplied: true, issues: [] })
    expect(resolved.level.topics).toEqual(three)
    expect(resolved.level.quiz.map((item) => item.topic)).toEqual([0, 2])
  })

  it('проверяет тест по фактическим темам: вопрос к теме 3 корректен только с правкой тем', () => {
    const quiz = [{ ...question(0), topic: 2 }]

    expect(resolveOverride(level, { quiz, ...meta })).toMatchObject({ quizApplied: false, level })
    expect(resolveOverride(level, { topics: three, quiz, ...meta })).toMatchObject({ topicsApplied: true, quizApplied: true })
  })

  it('без правки теста оставляет тест из сборки, если он подходит к новым темам', () => {
    const resolved = resolveOverride(level, { topics: three, ...meta })

    expect(resolved).toMatchObject({ topicsApplied: true, quizApplied: false, issues: [] })
    expect(resolved.level.quiz).toBe(level.quiz)
  })

  it('отбрасывает тест правки, не подходящий к темам, и берёт тест из сборки', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Одна тема: вопрос к теме 2 из правки теста не подходит, а тест из сборки (тема 1) подходит.
    const one = [topic('Единственная')]

    const resolved = resolveOverride(level, { topics: one, quiz: [question(1)], ...meta })

    expect(resolved).toMatchObject({ topicsApplied: true, quizApplied: false })
    expect(resolved.level.topics).toEqual(one)
    expect(resolved.level.quiz).toBe(level.quiz)
    expect(resolved.issues[0]).toMatch(/^тест не применён/)
    expect(applyOverride(level, { topics: one, quiz: [question(1)], ...meta }).topics).toEqual(one)
    expect(console.warn).toHaveBeenCalled()
  })

  it('если к темам правки не подходит ни тест правки, ни тест из сборки, показывает уровень из сборки целиком', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const withSecond: Level = { ...level, quiz: [question(1)] }
    const one = [topic('Единственная')]

    const broken = resolveOverride(withSecond, { topics: one, quiz: [question(1)], ...meta })
    const withoutQuiz = resolveOverride(withSecond, { topics: one, ...meta })

    expect(broken).toMatchObject({ level: withSecond, topicsApplied: false, quizApplied: false })
    expect(broken.issues).toHaveLength(2)
    expect(withoutQuiz).toMatchObject({ level: withSecond, topicsApplied: false, quizApplied: false })
    expect(applyOverride(withSecond, { topics: one, ...meta })).toBe(withSecond)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('некорректные темы не применяются, а тест правки проверяется по темам из сборки', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const quiz = [{ ...question(0), topic: 2 }]

    const resolved = resolveOverride(level, { topics: [topic('Первая'), { title: '', html: '<p>-</p>' }, topic('Третья')], quiz, ...meta })

    expect(resolved).toMatchObject({ level, topicsApplied: false, quizApplied: false })
    expect(resolved.issues).toHaveLength(2)
  })
})

describe('fetchLevel', () => {
  afterEach(() => {
    firebase.value = null
  })

  it('без Firebase не ходит в сеть и отдаёт уровень из сборки', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLevel('vue-junior')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.id).toBe('vue-junior')
  })

  it('читает правку по REST без SDK и подставляет тест', async () => {
    firebase.value = { apiKey: 'key', databaseURL: 'https://db.example/' }
    const quiz = [{ ...question(0), question: 'Отредактированный вопрос?' }]
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...override, quiz })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLevel('vue-junior')

    expect(fetchMock).toHaveBeenCalledWith(`https://db.example/${contentPath('vue-junior')}.json`, expect.anything())
    expect(result.quiz).toEqual(quiz)
  })

  it('при ошибке сети отдаёт тест из сборки', async () => {
    firebase.value = { apiKey: 'key', databaseURL: 'https://db.example' }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchLevel('vue-junior')

    expect(result.quiz.length).toBeGreaterThan(0)
    expect(result.quiz[0]?.question).not.toBe('Отредактированный вопрос?')
  })
})
