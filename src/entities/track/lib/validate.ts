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

/** Больше вариантов теста у уровня быть не может. */
export const MAX_QUIZ_VARIANTS = 5

/** Сколько вопросов варианта относится к каждой теме: `{ 0: 3, 1: 3, … }` в виде строки для сравнения. */
function topicDistribution(quiz: readonly QuizQuestion[]): string {
  const counts = new Map<number, number>()
  for (const question of quiz) counts.set(question.topic, (counts.get(question.topic) ?? 0) + 1)
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([topic, count]) => `${topic}:${count}`)
    .join(',')
}

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Ошибки всех вариантов теста. С одним вариантом сообщения те же, что у `quizIssues`; с несколькими у каждого
 * сообщения есть префикс «Вариант 2. ». Варианты должны совпадать по числу вопросов и распределению по темам,
 * а вопросы — не повторяться между вариантами. Позиции верных ответов не проверяются: варианты ответов
 * перемешиваются при каждом показе.
 */
export function quizVariantsIssues(variants: unknown, topicCount: number): string[] {
  if (!Array.isArray(variants) || variants.length === 0) return ['в тесте нет вариантов']
  if (variants.length > MAX_QUIZ_VARIANTS) return [`вариантов теста может быть не больше ${MAX_QUIZ_VARIANTS}, а сейчас ${variants.length}`]
  if (variants.length === 1) return quizIssues(variants[0], topicCount)

  const own = variants.flatMap((quiz, index) => quizIssues(quiz, topicCount).map((issue) => `Вариант ${index + 1}. ${issue}`))
  if (own.length) return own

  const quizzes = variants as QuizQuestion[][]
  const [first] = quizzes as [QuizQuestion[], ...QuizQuestion[][]]
  const issues: string[] = []
  const expected = topicDistribution(first)
  quizzes.forEach((quiz, index) => {
    if (index === 0) return
    if (quiz.length !== first.length) {
      issues.push(`Вариант ${index + 1}: вопросов ${quiz.length}, а в варианте 1 — ${first.length}`)
    } else if (topicDistribution(quiz) !== expected) {
      issues.push(`Вариант ${index + 1}: вопросы распределены по темам не так, как в варианте 1`)
    }
  })

  const seen = new Map<string, string>()
  quizzes.forEach((quiz, variant) =>
    quiz.forEach((question, index) => {
      const key = normalizeText(question.question) + (question.code ? `\n${normalizeText(question.code)}` : '')
      const place = `вариант ${variant + 1}, вопрос ${index + 1}`
      const previous = seen.get(key)
      if (previous && !previous.startsWith(`вариант ${variant + 1},`)) issues.push(`Вопрос повторяется: ${previous} и ${place}`)
      else if (!previous) seen.set(key, place)
    }),
  )
  return issues
}

/** Type guard поверх `quizVariantsIssues`. */
export function isValidQuizVariants(variants: unknown, topicCount: number): variants is QuizQuestion[][] {
  return quizVariantsIssues(variants, topicCount).length === 0
}

/** Ошибки собственного контента уровня: темы с текстом и корректные варианты теста. */
export function levelIssues(level: Level): string[] {
  return [...topicsIssues(level.topics), ...quizVariantsIssues(level.quizVariants, level.topics.length)]
}
