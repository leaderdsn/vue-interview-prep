import { PASS_SCORE } from '@/entities/progress'

export type ScoreTone = 'good' | 'bad' | 'neutral'

const FAIL_SCORE = 60

export function scoreTone(percent: number): ScoreTone {
  if (percent >= PASS_SCORE) return 'good'
  if (percent < FAIL_SCORE) return 'bad'
  return 'neutral'
}
