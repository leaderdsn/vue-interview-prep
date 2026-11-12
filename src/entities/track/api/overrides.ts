import { sanitizeTopicHtml } from '../lib/sanitize'
import { isValidQuiz, isValidTopics, quizIssues, topicsIssues } from '../lib/validate'

import type { Level, QuizQuestion, Topic } from '../model/types'

/**
 * Правки из админки лежат в Firebase Realtime Database по пути `interviewPrep/content/<levelId>`
 * (читать могут все, писать — администраторы, см. database.rules.json) и заменяют тест и/или темы из сборки.
 * Части записи (`quiz`, `topics`) сохраняются и удаляются независимо друг от друга; если в правке изменилось
 * число или порядок тем, редактор сохраняет обе части одним `update`, чтобы тест не ссылался на чужие темы.
 */
export const contentPath = (levelId: string) => `interviewPrep/content/${levelId}`

/** Части правки, которые сохраняются по отдельности. */
export type OverridePart = 'quiz' | 'topics'

export type LevelOverride = {
  quiz?: QuizQuestion[]
  topics?: Topic[]
  /** ISO-дата последнего сохранения любой части и кто сохранил. */
  updatedAt: string
  updatedBy: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Оставляет только известные поля, чтобы посторонние данные из базы не попали в интерфейс. */
function pickQuestion({ topic, type, question, code, options, answer, explanation }: QuizQuestion): QuizQuestion {
  return { topic, type, question, ...(code ? { code } : {}), options: [...options], answer, explanation }
}

/**
 * Форма записи из базы; содержимое частей проверяется по уровню в `applyOverride`.
 * Старые записи содержат только `quiz`. Null для всего, что не является правкой (пустой путь, мусор).
 */
export function parseOverride(raw: unknown): LevelOverride | null {
  if (!isRecord(raw)) return null
  const quiz = Array.isArray(raw.quiz) ? (raw.quiz as QuizQuestion[]) : undefined
  const topics = Array.isArray(raw.topics) ? (raw.topics as Topic[]) : undefined
  if (!quiz && !topics) return null
  return {
    ...(quiz ? { quiz } : {}),
    ...(topics ? { topics } : {}),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : '',
  }
}

/** Темы правки с очищенным HTML или null, если правка некорректна (в том числе после очистки). */
function pickTopics(topics: unknown): Topic[] | null {
  if (!isValidTopics(topics)) return null
  const cleaned = topics.map(({ title, html }) => ({ title, html: sanitizeTopicHtml(html) }))
  return isValidTopics(cleaned) ? cleaned : null
}

/** Уровень, который увидят пользователи, и какие части правки в него попали. */
export type ResolvedLevel = {
  level: Level
  topicsApplied: boolean
  quizApplied: boolean
  /** Почему часть правки не применена (для консоли и редактора); пусто — применено всё, что было. */
  issues: string[]
}

/**
 * Правила применения правки (темы и тест должны подходить друг другу, иначе вопросы ссылаются на чужие темы):
 * 1. Темы правки применяются, если их от 1 до `MAX_TOPICS` и у каждой после очистки HTML есть заголовок и текст.
 * 2. Тест правки проверяется по фактическому числу тем (из правки или из сборки).
 * 3. Если тест правки не подходит или его нет, берётся тест из сборки — но только если он подходит к фактическим темам.
 *    Иначе правка тем тоже не применяется: пользователи видят уровень из сборки целиком.
 */
export function resolveOverride(level: Level, override: LevelOverride | null): ResolvedLevel {
  if (!override) return { level, topicsApplied: false, quizApplied: false, issues: [] }
  const issues: string[] = []

  let topics = level.topics
  let topicsApplied = false
  if (override.topics) {
    const picked = pickTopics(override.topics)
    if (picked) {
      topics = picked
      topicsApplied = true
    } else {
      const found = topicsIssues(override.topics)
      issues.push(`темы не применены: ${(found.length ? found : ['пустой текст после очистки HTML']).join('; ')}`)
    }
  }

  let quiz = level.quiz
  let quizApplied = false
  if (override.quiz) {
    if (isValidQuiz(override.quiz, topics.length)) {
      quiz = override.quiz.map(pickQuestion)
      quizApplied = true
    } else {
      issues.push(`тест не применён: ${quizIssues(override.quiz, topics.length).join('; ')}`)
    }
  }

  if (topicsApplied && !quizApplied && !isValidQuiz(level.quiz, topics.length)) {
    issues.push(`тест из сборки ссылается на темы, которых нет среди ${topics.length} тем правки, — темы тоже не применены`)
    return { level, topicsApplied: false, quizApplied: false, issues }
  }

  return {
    level: topicsApplied || quizApplied ? { ...level, topics, quiz } : level,
    topicsApplied,
    quizApplied,
    issues,
  }
}

/** Уровень с отредактированными тестом и темами; некорректные части правки пропускаются с предупреждением в консоли. */
export function applyOverride(level: Level, override: LevelOverride | null): Level {
  const resolved = resolveOverride(level, override)
  if (resolved.issues.length) console.warn(`Правка уровня «${level.id}» из базы применена не полностью:`, resolved.issues)
  return resolved.level
}
