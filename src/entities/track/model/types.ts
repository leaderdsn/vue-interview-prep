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
  /**
   * Варианты теста (от 1 до `MAX_QUIZ_VARIANTS`), в каждом одинаковое число вопросов с тем же распределением по темам.
   * Пользователь при каждом прохождении получает вариант, который ещё не проходил.
   */
  quizVariants: QuizQuestion[][]
}

/**
 * Файл уровня в `data/levels`: с одним вариантом теста — старое поле `quiz`, с несколькими — `quizVariants`.
 * При загрузке приводится к `Level` (`normalizeLevel`).
 */
export type LevelFile = Omit<Level, 'quizVariants'> & { quiz?: QuizQuestion[]; quizVariants?: QuizQuestion[][] }

/** Доступ к уровню: Junior бесплатно, Middle и Senior — после оплаты (оплата появится позже, пока открыто всё). */
export type LevelAccess = 'free' | 'paid'

/** Облегчённые сведения об уровне для списков и прогресса, включаются в бандл сразу. */
export type LevelSummary = {
  id: string
  level: LevelName
  description: string
  topicTitles: string[]
  /** Вопросов в одном варианте теста. */
  quizCount: number
  /** Сколько вариантов теста. */
  quizVariants: number
  access: LevelAccess
  /** Задач с решением кодом (появятся позже). */
  taskCount: number
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
