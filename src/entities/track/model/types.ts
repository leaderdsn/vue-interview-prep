export type LevelName = 'junior' | 'middle' | 'senior'

export type QuestionType = 'theory' | 'practice'

export type QuizQuestion = {
  /** Index of the topic inside the level that explains this question. */
  topic: number
  type: QuestionType
  question: string
  /** Optional code snippet shown as plain text under the question. */
  code?: string
  options: string[]
  /** Index of the correct option in `options`. */
  answer: number
  explanation: string
}

export type Topic = {
  title: string
  /** Trusted HTML from the bundled content (see `shared/styles/_content.sass` for its classes). */
  html: string
}

/** Full content of one level of a track, loaded lazily. */
export type Level = {
  /** `${trackId}-${level}`, e.g. "vue-middle". */
  id: string
  trackId: string
  level: LevelName
  topics: Topic[]
  quiz: QuizQuestion[]
}

/** Lightweight level info for lists and progress, bundled eagerly. */
export type LevelSummary = {
  id: string
  level: LevelName
  description: string
  topicTitles: string[]
  quizCount: number
}

export type Track = {
  id: string
  title: string
  description: string
  levels: LevelSummary[]
}
