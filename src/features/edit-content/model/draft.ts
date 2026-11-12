import { OPTION_COUNT } from '@/entities/track'

import type { QuestionType, QuizQuestion } from '@/entities/track'

export const TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  theory: 'Теория',
  practice: 'Практика',
}

export function createQuestion(topic = 0): QuizQuestion {
  return {
    topic,
    type: 'theory',
    question: '',
    options: Array.from({ length: OPTION_COUNT }, () => ''),
    answer: 0,
    explanation: '',
  }
}

/** Независимая глубокая копия: черновик не делит объекты с загруженным уровнем и записью из базы. */
export function cloneQuiz(quiz: readonly QuizQuestion[]): QuizQuestion[] {
  return JSON.parse(JSON.stringify(quiz)) as QuizQuestion[]
}

/** Копия списка с перемещённым элементом; перемещение за границы оставляет список как есть. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const result = [...list]
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return result
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item as T)
  return result
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

/** Тест в виде для сохранения и скачивания: пустое поле кода убирается, как в файлах, написанных вручную. */
export function finalizeQuiz(quiz: readonly QuizQuestion[]): QuizQuestion[] {
  return quiz.map(({ topic, type, question, code, options, answer, explanation }) => ({
    topic,
    type,
    question,
    ...(code?.trim() ? { code } : {}),
    options: [...options],
    answer,
    explanation,
  }))
}

export function isSameQuiz(a: readonly QuizQuestion[], b: readonly QuizQuestion[]): boolean {
  return JSON.stringify(finalizeQuiz(a)) === JSON.stringify(finalizeQuiz(b))
}
