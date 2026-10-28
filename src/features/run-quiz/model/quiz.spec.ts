import { describe, expect, it } from 'vitest'

import { createQuizSession, scoreQuiz } from './quiz'
import type { QuizAnswers } from './quiz'

import type { QuizQuestion } from '@/entities/track'

function question(type: QuizQuestion['type'], answer: number): QuizQuestion {
  return { topic: 0, type, question: 'q', options: ['a', 'b', 'c', 'd'], answer, explanation: 'e' }
}

const questions = [question('theory', 0), question('practice', 1), question('theory', 2)]

function seeded(values: number[]) {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('createQuizSession', () => {
  it('содержит каждый вопрос и каждый вариант ровно один раз', () => {
    const session = createQuizSession(questions)

    expect(session.map((item) => item.questionIndex).sort()).toEqual([0, 1, 2])
    session.forEach((item) => expect([...item.optionOrder].sort()).toEqual([0, 1, 2, 3]))
  })

  it('детерминирован при заданном генераторе', () => {
    const values = [0.1, 0.9, 0.5]

    expect(createQuizSession(questions, seeded(values))).toEqual(createQuizSession(questions, seeded(values)))
  })

  it('при генераторе, всегда возвращающем 0, сдвигает элементы по алгоритму Фишера–Йетса', () => {
    const session = createQuizSession(questions, () => 0)

    expect(session.map((item) => item.questionIndex)).toEqual([1, 2, 0])
    expect(session[0]!.optionOrder).toEqual([1, 2, 3, 0])
  })

  it('не меняет исходные вопросы и обрабатывает пустой список', () => {
    const copy = structuredClone(questions)

    createQuizSession(questions)

    expect(questions).toEqual(copy)
    expect(createQuizSession([])).toEqual([])
  })
})

describe('scoreQuiz', () => {
  it.each<{ name: string; answers: QuizAnswers; correct: number; percent: number; wrong: number[] }>([
    { name: 'все верно', answers: { 0: 0, 1: 1, 2: 2 }, correct: 3, percent: 100, wrong: [] },
    { name: 'часть верно', answers: { 0: 0, 1: 0, 2: 2 }, correct: 2, percent: 67, wrong: [1] },
    { name: 'без ответов', answers: {}, correct: 0, percent: 0, wrong: [0, 1, 2] },
  ])('$name', ({ answers, correct, percent, wrong }) => {
    expect(scoreQuiz(questions, answers)).toMatchObject({ correct, total: 3, percent, wrong })
  })

  it('считает результаты по типам вопросов', () => {
    const { byType } = scoreQuiz(questions, { 0: 0, 1: 3, 2: 2 })

    expect(byType).toEqual({ theory: { correct: 2, total: 2 }, practice: { correct: 0, total: 1 } })
  })

  it('возвращает 0% для пустого квиза', () => {
    expect(scoreQuiz([], {})).toMatchObject({ total: 0, percent: 0, wrong: [] })
  })
})
