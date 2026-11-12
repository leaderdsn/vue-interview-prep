export type LevelName = 'junior' | 'middle' | 'senior'

export type QuestionType = 'theory' | 'practice'

export type QuizQuestion = {
  /** Индекс темы внутри уровня, которая объясняет этот вопрос. */
  topic: number
  type: QuestionType
  question: string
  /** Необязательный фрагмент кода, показывается простым текстом под вопросом. */
  code?: string
  options: string[]
  /** Индекс правильного варианта в `options`. */
  answer: number
  explanation: string
}

export type Topic = {
  title: string
  /**
   * HTML темы (его классы — в `shared/styles/_content.sass`): доверенный из сборки
   * или очищенный `sanitizeTopicHtml` из правки в базе.
   */
  html: string
}

/** Полный контент одного уровня трека, загружается лениво. */
export type Level = {
  /** `${trackId}-${level}`, например "vue-middle". */
  id: string
  trackId: string
  level: LevelName
  topics: Topic[]
  quiz: QuizQuestion[]
}

/** Облегчённые сведения об уровне для списков и прогресса, включаются в бандл сразу. */
export type LevelSummary = {
  id: string
  level: LevelName
  description: string
  topicTitles: string[]
  quizCount: number
}

/** Раздел главной страницы, к которому относится направление. */
export type TrackCategory = 'vue' | 'react' | 'angular' | 'general'

export type Track = {
  id: string
  title: string
  description: string
  category: TrackCategory
  levels: LevelSummary[]
}
