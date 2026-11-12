import { describe, expect, it } from 'vitest'

import { cloneQuiz, createQuestion, finalizeQuiz, isSameQuiz, moveItem, removeItem } from './draft'

import type { QuizQuestion } from '@/entities/track'

const question: QuizQuestion = {
  topic: 1,
  type: 'practice',
  question: 'Что выведет код?',
  code: 'console.log(1)',
  options: ['1', '2', '3', '4'],
  answer: 0,
  explanation: 'Единицу.',
}

describe('черновик теста', () => {
  it('создаёт пустой вопрос с четырьмя вариантами', () => {
    expect(createQuestion(2)).toEqual({
      topic: 2,
      type: 'theory',
      question: '',
      options: ['', '', '', ''],
      answer: 0,
      explanation: '',
    })
  })

  it('копирует тест целиком, не разделяя объекты', () => {
    const quiz = [question]
    const copy = cloneQuiz(quiz)

    copy[0]!.options[0] = 'другое'

    expect(question.options[0]).toBe('1')
  })

  it('переставляет вопросы и не выходит за границы списка', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c'])
  })

  it('удаляет вопрос по номеру', () => {
    expect(removeItem(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
  })

  it('перед сохранением убирает пустой код и лишние поля', () => {
    const draft = { ...question, code: '  \n', extra: true } as QuizQuestion

    expect(finalizeQuiz([draft])).toEqual([
      { topic: 1, type: 'practice', question: 'Что выведет код?', options: ['1', '2', '3', '4'], answer: 0, explanation: 'Единицу.' },
    ])
  })

  it('не считает изменением пустое поле кода', () => {
    const withoutCode: QuizQuestion = { ...question }
    delete withoutCode.code

    expect(isSameQuiz([{ ...withoutCode, code: '' }], [withoutCode])).toBe(true)
    expect(isSameQuiz([question], [{ ...question, answer: 1 }])).toBe(false)
  })
})
