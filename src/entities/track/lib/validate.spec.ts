import { describe, expect, it } from 'vitest'

import {
  answerLengthHint,
  answerLengthIssues,
  levelIssues,
  MAX_QUIZ_VARIANTS,
  MAX_TOPICS,
  questionIssues,
  quizIssues,
  quizVariantsIssues,
  topicsIssues,
} from './validate'

import type { Level, QuizQuestion } from '../model/types'

const question: QuizQuestion = {
  topic: 1,
  type: 'practice',
  question: 'Что выведет код?',
  code: 'console.log(1)',
  options: ['1', '2', '3', '4'],
  answer: 0,
  explanation: 'Выводится единица.',
}

describe('questionIssues', () => {
  it('принимает корректный вопрос, в том числе без кода', () => {
    const withoutCode: QuizQuestion = { ...question }
    delete withoutCode.code

    expect(questionIssues(question, 2)).toEqual([])
    expect(questionIssues(withoutCode, 2)).toEqual([])
  })

  it.each<[string, Partial<Record<keyof QuizQuestion, unknown>>, string]>([
    ['тема вне уровня', { topic: 2 }, 'тема не выбрана или её нет в уровне'],
    ['дробная тема', { topic: 0.5 }, 'тема не выбрана или её нет в уровне'],
    ['неизвестный тип', { type: 'quiz' }, 'тип должен быть «теория» или «практика»'],
    ['пустой текст', { question: '  ' }, 'пустой текст вопроса'],
    ['код не строка', { code: 1 }, 'код должен быть строкой'],
    ['три варианта', { options: ['1', '2', '3'] }, 'нужно ровно 4 варианта ответа'],
    ['пустой вариант', { options: ['1', '2', '', '4'] }, 'есть пустой вариант ответа'],
    ['повтор варианта', { options: ['1', '1', '3', '4'] }, 'варианты ответа повторяются'],
    ['ответ вне списка', { answer: 4 }, 'не выбран правильный ответ'],
    ['пустое пояснение', { explanation: '' }, 'пустое пояснение'],
  ])('находит ошибку: %s', (_name, change, issue) => {
    expect(questionIssues({ ...question, ...change }, 2)).toEqual([issue])
  })

  it('не принимает не объект', () => {
    expect(questionIssues('вопрос', 2)).toEqual(['не объект'])
  })
})

describe('quizIssues', () => {
  it('нумерует ошибки по вопросам', () => {
    expect(quizIssues([question, { ...question, explanation: '' }], 2)).toEqual(['Вопрос 2: пустое пояснение'])
  })

  it('не принимает пустой тест и не список', () => {
    expect(quizIssues([], 2)).toEqual(['в тесте нет вопросов'])
    expect(quizIssues({ 0: question }, 2)).toEqual(['тест должен быть списком вопросов'])
  })
})

describe('topicsIssues', () => {
  const topic = { title: 'Тема', html: '<p>Текст</p>' }

  it(`принимает от 1 до ${MAX_TOPICS} тем — число может отличаться от сборки`, () => {
    expect(topicsIssues([topic])).toEqual([])
    expect(topicsIssues(Array.from({ length: MAX_TOPICS }, () => topic))).toEqual([])
  })

  it('не принимает пустой список, слишком много тем и не список', () => {
    expect(topicsIssues([])).toEqual(['в уровне нет тем'])
    expect(topicsIssues(Array.from({ length: MAX_TOPICS + 1 }, () => topic))).toEqual([
      `тем может быть не больше ${MAX_TOPICS}, а сейчас ${MAX_TOPICS + 1}`,
    ])
    expect(topicsIssues({ 0: topic })).toEqual(['темы должны быть списком'])
  })
})

describe('levelIssues', () => {
  it('проверяет темы и тест уровня', () => {
    const level: Level = {
      id: 'vue-junior',
      trackId: 'vue',
      level: 'junior',
      topics: [
        { title: 'Основы', html: '<p>Текст</p>' },
        { title: 'Шаблоны', html: ' ' },
      ],
      quizVariants: [[question]],
    }

    expect(levelIssues(level)).toEqual(['Тема 2: пустой заголовок или текст'])
  })
})

describe('answerLengthHint', () => {
  const withOptions = (options: string[], answer: number): QuizQuestion => ({ ...question, options, answer })

  it('молчит, когда верный вариант не выделяется длиной', () => {
    expect(answerLengthHint(withOptions(['короткий', 'средний вариант', 'ещё вариант', 'четвёртый'], 2))).toBeNull()
  })

  it('предупреждает, когда верный вариант в полтора раза длиннее среднего неверного', () => {
    expect(answerLengthHint(withOptions(['да', 'нет', 'подробный правильный ответ с оговорками', 'никогда'], 2))).toMatch(/угадать по длине/)
  })
})

describe('answerLengthIssues', () => {
  // Верный вариант на месте answer длиной `answerLength`, остальные — по 10 символов.
  const make = (answerLength: number): QuizQuestion => ({
    ...question,
    options: ['a'.repeat(answerLength), 'b'.repeat(10), 'c'.repeat(10), 'd'.repeat(10)].map((option, i) => `${option}${i}`),
    answer: 0,
  })

  it('принимает тест без перекоса', () => {
    // Верный вариант средней длины: не самый длинный и не самый короткий.
    const middle: QuizQuestion = { ...question, options: ['a'.repeat(11), 'b'.repeat(12), 'c'.repeat(8), 'd'.repeat(10)], answer: 0 }
    const quiz = [...Array.from({ length: 4 }, () => make(12)), ...Array.from({ length: 4 }, () => make(8)), ...Array.from({ length: 4 }, () => middle)]

    expect(answerLengthIssues(quiz)).toEqual([])
  })

  it('находит тест, где верный ответ почти всегда самый длинный', () => {
    const issues = answerLengthIssues(Array.from({ length: 12 }, () => make(14)))

    expect(issues).toEqual(['верный вариант самый длинный в 12 вопросах из 12 (допустимо до 4)'])
  })

  it('находит и обратный перекос — верный ответ всегда самый короткий', () => {
    expect(answerLengthIssues(Array.from({ length: 12 }, () => make(8)))).toEqual([
      'верный вариант самый короткий в 12 вопросах из 12 (допустимо до 4)',
    ])
  })

  it('перечисляет вопросы, где верный ответ заметно длиннее', () => {
    const quiz = [make(30), make(8), make(8), make(12)]

    expect(answerLengthIssues(quiz)).toContain('Вопрос 1: верный вариант заметно длиннее остальных — его легко угадать по длине')
  })
})

describe('quizVariantsIssues', () => {
  const ask = (topic: number, text: string): QuizQuestion => ({ topic, type: 'theory', question: text, options: ['1', '2', '3', '4'], answer: 0, explanation: 'Так.' })
  const first = [ask(0, 'Первый?'), ask(1, 'Второй?')]
  const second = [ask(1, 'Третий?'), ask(0, 'Четвёртый?')]

  it('с одним вариантом сообщения как у quizIssues', () => {
    expect(quizVariantsIssues([[{ ...question, explanation: '' }]], 2)).toEqual(quizIssues([{ ...question, explanation: '' }], 2))
  })

  it('принимает варианты с тем же распределением по темам в любом порядке', () => {
    expect(quizVariantsIssues([first, second], 2)).toEqual([])
  })

  it('ошибки вопросов — с номером варианта', () => {
    expect(quizVariantsIssues([first, [ask(1, 'Третий?'), ask(5, 'Пятый?')]], 2)).toEqual([
      'Вариант 2. Вопрос 2: тема не выбрана или её нет в уровне',
    ])
  })

  it('варианты совпадают по числу вопросов и распределению по темам', () => {
    expect(quizVariantsIssues([first, [ask(0, 'Третий?')]], 2)).toEqual(['Вариант 2: вопросов 1, а в варианте 1 — 2'])
    expect(quizVariantsIssues([first, [ask(0, 'Третий?'), ask(0, 'Четвёртый?')]], 2)).toEqual([
      'Вариант 2: вопросы распределены по темам не так, как в варианте 1',
    ])
  })

  it('вопросы не повторяются между вариантами (без учёта регистра и пробелов)', () => {
    expect(quizVariantsIssues([first, [ask(1, '  второй? '), ask(0, 'Четвёртый?')]], 2)).toEqual([
      'Вопрос повторяется: вариант 1, вопрос 2 и вариант 2, вопрос 1',
    ])
  })

  it(`не больше ${MAX_QUIZ_VARIANTS} вариантов и хотя бы один`, () => {
    expect(quizVariantsIssues([], 2)).toEqual(['в тесте нет вариантов'])
    expect(quizVariantsIssues(Array.from({ length: MAX_QUIZ_VARIANTS + 1 }, () => first), 2)[0]).toMatch(/не больше/)
  })
})
