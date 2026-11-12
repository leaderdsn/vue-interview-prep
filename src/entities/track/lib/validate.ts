import type { Level, QuizQuestion, Topic } from '../model/types'

/** Ровно столько вариантов ответа у каждого вопроса. */
export const OPTION_COUNT = 4

/**
 * Больше тем в уровне быть не может: столько шагов-тем пропускает роутер и столько тем принимает правка из админки.
 * Число тем в правке может отличаться от сборки: администратор добавляет и удаляет темы.
 */
export const MAX_TOPICS = 20

const QUESTION_TYPES: readonly unknown[] = ['theory', 'practice']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/**
 * Ошибки одного вопроса теста по-русски — для редактора и тестов контента.
 * Принимает unknown, потому что правки приходят из базы.
 */
export function questionIssues(question: unknown, topicCount: number): string[] {
  if (!isRecord(question)) return ['не объект']
  const issues: string[] = []
  const { topic, type, question: text, code, options, answer, explanation } = question

  if (!Number.isInteger(topic) || (topic as number) < 0 || (topic as number) >= topicCount) {
    issues.push('тема не выбрана или её нет в уровне')
  }
  if (!QUESTION_TYPES.includes(type)) issues.push('тип должен быть «теория» или «практика»')
  if (!isText(text)) issues.push('пустой текст вопроса')
  if (code !== undefined && typeof code !== 'string') issues.push('код должен быть строкой')

  if (!Array.isArray(options) || options.length !== OPTION_COUNT) {
    issues.push(`нужно ровно ${OPTION_COUNT} варианта ответа`)
  } else {
    if (!options.every(isText)) issues.push('есть пустой вариант ответа')
    else if (new Set(options).size !== options.length) issues.push('варианты ответа повторяются')
    if (!Number.isInteger(answer) || options[answer as number] === undefined) issues.push('не выбран правильный ответ')
  }

  if (!isText(explanation)) issues.push('пустое пояснение')
  return issues
}

/** Ошибки всего теста с номером вопроса в начале: «Вопрос 3: пустое пояснение». */
export function quizIssues(quiz: unknown, topicCount: number): string[] {
  if (!Array.isArray(quiz)) return ['тест должен быть списком вопросов']
  if (quiz.length === 0) return ['в тесте нет вопросов']
  return quiz.flatMap((question, index) =>
    questionIssues(question, topicCount).map((issue) => `Вопрос ${index + 1}: ${issue}`),
  )
}

/** Type guard поверх `quizIssues`: тест без ошибок. */
export function isValidQuiz(quiz: unknown, topicCount: number): quiz is QuizQuestion[] {
  return quizIssues(quiz, topicCount).length === 0
}

/**
 * Ошибки тем уровня (правка из админки или файл уровня): от 1 до `MAX_TOPICS` тем, у каждой непустые заголовок и текст.
 * Число тем может отличаться от сборки; тест проверяется по фактическому числу тем (`quizIssues`).
 */
export function topicsIssues(topics: unknown): string[] {
  if (!Array.isArray(topics)) return ['темы должны быть списком']
  if (topics.length === 0) return ['в уровне нет тем']
  if (topics.length > MAX_TOPICS) return [`тем может быть не больше ${MAX_TOPICS}, а сейчас ${topics.length}`]
  return topics.flatMap((topic, index) =>
    isRecord(topic) && isText(topic.title) && isText(topic.html) ? [] : [`Тема ${index + 1}: пустой заголовок или текст`],
  )
}

/** Type guard поверх `topicsIssues`. */
export function isValidTopics(topics: unknown): topics is Topic[] {
  return topicsIssues(topics).length === 0
}

/** Ошибки собственного контента уровня: темы с текстом и корректный тест. */
export function levelIssues(level: Level): string[] {
  return [...topicsIssues(level.topics), ...quizIssues(level.quiz, level.topics.length)]
}
