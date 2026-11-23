import type { LevelProgress } from '../model/types'

/**
 * Выбирает вариант теста для нового прохождения: случайный из ещё не пройденных в текущем круге.
 * Когда пройдены все, начинается новый круг (`resetCircle`), но не с варианта, который проходили последним.
 */
export function pickVariant(
  count: number,
  progress: Pick<LevelProgress, 'variantsTaken' | 'lastVariant'>,
  random: () => number = Math.random,
): { variant: number; resetCircle: boolean } {
  if (count <= 1) return { variant: 0, resetCircle: false }
  const all = Array.from({ length: count }, (_, index) => index)
  const fresh = all.filter((index) => !progress.variantsTaken.includes(index))
  const resetCircle = fresh.length === 0
  const candidates = resetCircle ? all.filter((index) => index !== progress.lastVariant) : fresh
  const variant = candidates[Math.min(Math.floor(random() * candidates.length), candidates.length - 1)] ?? 0
  return { variant, resetCircle }
}
