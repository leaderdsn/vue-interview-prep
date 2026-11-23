import type { Level, LevelFile, QuizQuestion } from '../model/types'

/** Файл уровня (старое поле `quiz` или `quizVariants`) — в уровень с вариантами теста. */
export function normalizeLevel(file: LevelFile): Level {
  const { quiz, quizVariants, ...rest } = file
  return { ...rest, quizVariants: quizVariants ?? (quiz ? [quiz] : []) }
}

/**
 * Уровень в виде файла для репозитория: один вариант пишется старым полем `quiz`, чтобы у существующих
 * уровней не менялся формат, несколько — полем `quizVariants`. Порядок ключей как в файлах, написанных вручную.
 */
export function toLevelFile(level: Level): LevelFile {
  const { quizVariants, ...rest } = level
  return quizVariants.length === 1 ? { ...rest, quiz: quizVariants[0] } : { ...rest, quizVariants }
}

/** Вариант теста по номеру; при номере вне диапазона — первый. */
export function quizVariant(level: Pick<Level, 'quizVariants'>, index: number): QuizQuestion[] {
  return level.quizVariants[index] ?? level.quizVariants[0] ?? []
}
