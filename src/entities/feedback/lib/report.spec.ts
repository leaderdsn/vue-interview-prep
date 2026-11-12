import { describe, expect, it } from 'vitest'

import { buildFeedbackRecord, describeContext, feedbackIssues, normalizeQuote, parseFeedbackItem, parseFeedbackList } from './report'

import type { FeedbackDraft } from '../model/types'

const draft: FeedbackDraft = {
  kind: 'inaccuracy',
  text: '  Неверно описан watchEffect  ',
  email: '',
  context: { page: '/level/vue-middle/3', levelId: 'vue-middle', step: 3, topicTitle: 'Реактивность' },
}

describe('normalizeQuote', () => {
  it('схлопывает пробелы и переносы и обрезает до 300 символов с многоточием', () => {
    expect(normalizeQuote('  один\n\n  два\tтри ')).toBe('один два три')

    const long = normalizeQuote('слово '.repeat(100))
    expect(long).toHaveLength(300)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('feedbackIssues', () => {
  it('требует текст от 5 до 2000 символов без учёта пробелов по краям', () => {
    expect(feedbackIssues({ ...draft, text: '  abc   ' })).toEqual(['Опишите замечание: хотя бы 5 символов'])
    expect(feedbackIssues({ ...draft, text: 'x'.repeat(2001) })).toEqual(['Слишком длинный текст: не больше 2000 символов'])
    expect(feedbackIssues(draft)).toEqual([])
  })

  it('почта необязательна, но если указана — должна быть адресом', () => {
    expect(feedbackIssues({ ...draft, email: 'me@example' })).toEqual(['Проверьте адрес почты'])
    expect(feedbackIssues({ ...draft, email: ' me@example.com ' })).toEqual([])
  })
})

describe('buildFeedbackRecord', () => {
  it('собирает запись со статусом «новое», автором и временем сервера без пустых полей', () => {
    const record = buildFeedbackRecord(draft, 'u1', '1.2.3', 'TS')

    expect(record).toEqual({
      kind: 'inaccuracy',
      text: 'Неверно описан watchEffect',
      page: '/level/vue-middle/3',
      levelId: 'vue-middle',
      step: 3,
      topicTitle: 'Реактивность',
      appVersion: '1.2.3',
      createdAt: 'TS',
      uid: 'u1',
      status: 'new',
    })
    expect(Object.values(record)).not.toContain(undefined)
  })

  it('добавляет почту, вопрос теста и нормализованную цитату', () => {
    const record = buildFeedbackRecord(
      {
        ...draft,
        kind: 'quiz',
        email: 'me@example.com',
        context: { page: '/level/vue-middle/quiz', levelId: 'vue-middle', step: 'quiz', questionIndex: 0, questionText: 'Что?', quote: ' a\nb ' },
      },
      'u1',
      '1.0.0',
      0,
    )

    expect(record).toMatchObject({ email: 'me@example.com', step: 'quiz', questionIndex: 0, questionText: 'Что?', quote: 'a b' })
  })
})

describe('parseFeedbackList', () => {
  it('отбрасывает повреждённые записи и сортирует новые сверху', () => {
    const list = parseFeedbackList({
      old: { kind: 'typo', text: 'Старое', uid: 'u', createdAt: 1, status: 'fixed', page: '/', appVersion: '1' },
      fresh: { kind: 'suggestion', text: 'Новое', uid: 'u', createdAt: 5, status: 'new', page: '/', appVersion: '1', step: 'quiz' },
      broken: { kind: 'spam', text: 'x', uid: 'u', createdAt: 3, status: 'new' },
    })

    expect(list.map((item) => item.id)).toEqual(['fresh', 'old'])
    expect(list[0]?.step).toBe('quiz')
    expect(parseFeedbackList(null)).toEqual([])
    expect(parseFeedbackItem('x', 'строка')).toBeNull()
  })
})

describe('describeContext', () => {
  it('коротко описывает место замечания', () => {
    expect(describeContext(draft.context)).toBe('vue-middle · тема 3 «Реактивность»')
    expect(describeContext({ page: '/level/vue-middle/quiz', levelId: 'vue-middle', step: 'quiz', questionIndex: 4 })).toBe('vue-middle · тест, вопрос 5')
    expect(describeContext({ page: '/' })).toBe('Главная страница')
  })
})
