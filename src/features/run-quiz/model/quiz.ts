import type { QuizQuestion } from '@/entities/track'

export type QuizItem = {
  questionIndex: number
  /** Исходные индексы вариантов в порядке отображения. */
  optionOrder: number[]
}

/** Индекс вопроса -> ИСХОДНЫЙ индекс варианта. */
export type QuizAnswers = Record<number, number>

export type QuizResult = {
  correct: number
  total: number
  percent: number
  /** Вопросы с неверным ответом или без ответа. */
  wrong: number[]
  byType: Record<'theory' | 'practice', { correct: number; total: number }>
}

function shuffledIndexes(length: number, random: () => number): number[] {
  const items = Array.from({ length }, (_, i) => i)
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = items[i]!
    items[i] = items[j]!
    items[j] = tmp
  }
  return items
}

export function createQuizSession(questions: QuizQuestion[], random: () => number = Math.random): QuizItem[] {
  return shuffledIndexes(questions.length, random).map((questionIndex) => ({
    questionIndex,
    optionOrder: shuffledIndexes(questions[questionIndex]!.options.length, random),
  }))
}

export function scoreQuiz(questions: QuizQuestion[], answers: QuizAnswers): QuizResult {
  const byType: QuizResult['byType'] = { theory: { correct: 0, total: 0 }, practice: { correct: 0, total: 0 } }
  const wrong: number[] = []
  let correct = 0

  questions.forEach((question, index) => {
    const bucket = byType[question.type]
    bucket.total += 1
    if (answers[index] === question.answer) {
      correct += 1
      bucket.correct += 1
    } else {
      wrong.push(index)
    }
  })

  const total = questions.length
  return { correct, total, percent: total === 0 ? 0 : Math.round((correct / total) * 100), wrong, byType }
}
