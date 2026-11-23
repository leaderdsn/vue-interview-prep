import { describe, expect, it } from 'vitest'

import {
  buildFeedbackRecord,
  describeContext,
  feedbackImagesValue,
  feedbackIssues,
  isFeedbackImage,
  normalizeQuote,
  parseFeedbackImages,
  parseFeedbackItem,
  parseFeedbackList,
} from './report'

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
      imageCount: 0,
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

describe('картинки замечания', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo='
  const WEBP = 'data:image/webp;base64,UklGRhYAAABXRUJQ'

  it('принимает только data URL WebP, PNG и JPEG не длиннее 400 000 символов', () => {
    expect(isFeedbackImage(PNG)).toBe(true)
    expect(isFeedbackImage('data:image/jpeg;base64,/9j/')).toBe(true)
    expect(isFeedbackImage('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isFeedbackImage('data:image/gif;base64,R0lGOD')).toBe(false)
    expect(isFeedbackImage('javascript:alert(1)')).toBe(false)
    expect(isFeedbackImage('data:image/png;base64,')).toBe(false)
    expect(isFeedbackImage(`data:image/webp;base64,${'A'.repeat(400_000)}`)).toBe(false)
  })

  it('пишет не больше двух картинок с ключами 0 и 1, считает их в imageCount', () => {
    expect(feedbackImagesValue([PNG, 'мусор', WEBP, PNG])).toEqual({ 0: PNG, 1: WEBP })
    expect(feedbackImagesValue([])).toBeNull()
    expect(buildFeedbackRecord({ ...draft, images: [PNG, WEBP, PNG] }, 'u1', '1', 0).imageCount).toBe(2)
  })

  it('читает картинки из массива и из объекта, отбрасывая недопустимые', () => {
    expect(parseFeedbackImages([PNG, WEBP])).toEqual([PNG, WEBP])
    expect(parseFeedbackImages({ 1: WEBP, 0: PNG })).toEqual([PNG, WEBP])
    expect(parseFeedbackImages({ 0: 'data:text/html;base64,PGI+', 1: PNG })).toEqual([PNG])
    expect(parseFeedbackImages(null)).toEqual([])
  })

  it('imageCount из базы попадает в запись, только если больше нуля', () => {
    const base = { kind: 'typo', text: 'Текст', uid: 'u', createdAt: 1, status: 'new', page: '/', appVersion: '1' }

    expect(parseFeedbackItem('a', { ...base, imageCount: 2 })?.imageCount).toBe(2)
    expect(parseFeedbackItem('a', { ...base, imageCount: 0 })).not.toHaveProperty('imageCount')
  })
})

describe('describeContext', () => {
  it('коротко описывает место замечания', () => {
    expect(describeContext(draft.context)).toBe('vue-middle · тема 3 «Реактивность»')
    expect(describeContext({ page: '/level/vue-middle/quiz', levelId: 'vue-middle', step: 'quiz', questionIndex: 4 })).toBe('vue-middle · тест, вопрос 5')
    expect(describeContext({ page: '/level/vue-middle/quiz', levelId: 'vue-middle', step: 'quiz', quizVariant: 2, questionIndex: 0 })).toBe(
      'vue-middle · тест, вариант 3, вопрос 1',
    )
    expect(describeContext({ page: '/' })).toBe('Главная страница')
  })
})
