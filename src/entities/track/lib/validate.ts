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

/**
 * Во сколько раз верный вариант может быть длиннее среднего неверного. Длиннее — ответ угадывается
 * без знаний: «выбирай самый подробный вариант».
 */
export const ANSWER_LENGTH_RATIO = 1.5

/** Длины верного варианта и остальных; null, если вопрос сломан (это ловит `questionIssues`). */
function optionLengths(question: QuizQuestion): { answer: number; others: number[] } | null {
  const { options, answer } = question
  if (!Array.isArray(options) || options.length < 2 || typeof options[answer] !== 'string') return null
  const lengths = options.map((option) => String(option).trim().length)
  return { answer: lengths[answer] ?? 0, others: lengths.filter((_, index) => index !== answer) }
}

/** Подсказка редактору: верный вариант заметно длиннее неверных. Не ошибка — сохранить можно. */
export function answerLengthHint(question: QuizQuestion): string | null {
  const lengths = optionLengths(question)
  if (!lengths) return null
  const mean = lengths.others.reduce((sum, length) => sum + length, 0) / lengths.others.length
  return mean > 0 && lengths.answer > mean * ANSWER_LENGTH_RATIO
    ? 'верный вариант заметно длиннее остальных — его легко угадать по длине'
    : null
}

/**
 * Перекос длины ответов во всём тесте. При случайном порядке верный вариант самый длинный примерно в четверти
 * вопросов; допускаем треть. Самым коротким он тоже не должен быть систематически — иначе перекос просто
 * перевернётся. Вопросы с подсказкой `answerLengthHint` перечисляются отдельно.
 */
export function answerLengthIssues(quiz: readonly QuizQuestion[]): string[] {
  const limit = Math.ceil(quiz.length / 3)
  let longest = 0
  let shortest = 0
  const hints: string[] = []
  quiz.forEach((question, index) => {
    const lengths = optionLengths(question)
    if (!lengths) return
    if (lengths.answer >= Math.max(...lengths.others)) longest++
    if (lengths.answer <= Math.min(...lengths.others)) shortest++
    const hint = answerLengthHint(question)
    if (hint) hints.push(`Вопрос ${index + 1}: ${hint}`)
  })
  return [
    ...(longest > limit ? [`верный вариант самый длинный в ${longest} вопросах из ${quiz.length} (допустимо до ${limit})`] : []),
    ...(shortest > limit ? [`верный вариант самый короткий в ${shortest} вопросах из ${quiz.length} (допустимо до ${limit})`] : []),
    ...hints,
  ]
}

/** Ошибки собственного контента уровня: темы с текстом и корректный тест. */
export function levelIssues(level: Level): string[] {
  return [...topicsIssues(level.topics), ...quizIssues(level.quiz, level.topics.length)]
}
