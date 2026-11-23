/** Место замечания, которое можно открыть в редакторе контента: уровень и тема (с 1) или вопрос теста. */
export type EditorTarget = {
  levelId: string
  step: number | 'quiz'
  /** Номер варианта теста (с 0), если не первый. */
  quizVariant?: number
  questionIndex?: number
}
