import { describe, expect, it } from 'vitest'

import { TRACKS } from './trackApi'

import type { Level } from '../model/types'

// Content is hand-written JSON, so its shape is checked here rather than at runtime.
const levels = import.meta.glob<Level>('../data/levels/*.json', { import: 'default', eager: true })

const summaries = TRACKS.flatMap((track) => track.levels.map((level) => ({ track, level })))

describe('контент направлений', () => {
  it('у каждого уровня в индексе есть файл, и лишних файлов нет', () => {
    const files = Object.keys(levels).map((path) => path.replace(/^.*\/(.+)\.json$/, '$1'))

    expect(files.sort()).toEqual(summaries.map(({ level }) => level.id).sort())
  })

  it.each(summaries)('$level.id совпадает с индексом и корректен', ({ track, level: summary }) => {
    const level = levels[`../data/levels/${summary.id}.json`]
    if (!level) throw new Error(`Нет файла ${summary.id}.json`)

    expect(level.id).toBe(summary.id)
    expect(level.trackId).toBe(track.id)
    expect(level.level).toBe(summary.level)
    expect(level.topics.map((topic) => topic.title)).toEqual(summary.topicTitles)
    expect(level.quiz).toHaveLength(summary.quizCount)

    for (const topic of level.topics) expect(topic.html.trim()).not.toBe('')
    for (const question of level.quiz) {
      expect(question.topic).toBeGreaterThanOrEqual(0)
      expect(question.topic).toBeLessThan(level.topics.length)
      expect(['theory', 'practice']).toContain(question.type)
      expect(question.options).toHaveLength(4)
      expect(new Set(question.options).size).toBe(4)
      expect(question.options[question.answer]).toBeDefined()
      expect(question.explanation.trim()).not.toBe('')
    }
  })
})
