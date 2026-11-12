import { describe, expect, it } from 'vitest'

import { findLevel, MAX_TOPICS } from '@/entities/track'
import { ROUTE_NAMES } from '@/shared/config'

import { guardLevel } from './router'

import type { RouteLocationNormalized } from 'vue-router'

const to = (levelId: string, step?: string) =>
  ({
    params: { levelId, ...(step === undefined ? {} : { step }) },
    path: `/level/${levelId}${step === undefined ? '' : `/${step}`}`,
  }) as unknown as RouteLocationNormalized

const indexCount = findLevel('vue-junior')?.level.topicTitles.length ?? 0

describe('guardLevel', () => {
  it('пропускает темы из индекса и тест', () => {
    expect(guardLevel(to('vue-junior', '1'))).toBe(true)
    expect(guardLevel(to('vue-junior', String(indexCount)))).toBe(true)
    expect(guardLevel(to('vue-junior', 'quiz'))).toBe(true)
  })

  it(`пропускает темы сверх индекса до ${MAX_TOPICS}: их могли добавить правкой из базы`, () => {
    expect(guardLevel(to('vue-junior', String(indexCount + 1)))).toBe(true)
    expect(guardLevel(to('vue-junior', String(MAX_TOPICS)))).toBe(true)
  })

  it.each(['0', String(MAX_TOPICS + 1), '1.5', 'abc'])('отдаёт 404 на шаг %s', (step) => {
    expect(guardLevel(to('vue-junior', step))).toMatchObject({ name: ROUTE_NAMES.notFound })
  })

  it('отдаёт 404 на неизвестный уровень и ведёт на первую тему без шага', () => {
    expect(guardLevel(to('нет-уровня', '1'))).toMatchObject({ name: ROUTE_NAMES.notFound })
    expect(guardLevel(to('vue-junior'))).toMatchObject({ name: ROUTE_NAMES.level, params: { step: '1' } })
  })
})
