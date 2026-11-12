import { describe, expect, it } from 'vitest'

import { levelIssues } from '../lib/validate'

import { findIndexFile, TRACK_CATEGORIES, TRACK_INDEX_FILES, TRACKS } from './trackApi'

import type { Level } from '../model/types'

// Контент — JSON, написанный вручную, поэтому его форма проверяется здесь, а не во время работы.
// Правила для теста общие с редактором (lib/validate.ts).
const levels = import.meta.glob<Level>('../data/levels/*.json', { import: 'default', eager: true })

// Исходный текст файлов индекса: редактор скачивает их заново, и разница должна быть только в правке.
const rawIndexFiles = import.meta.glob<string>('../data/tracks*.json', { query: '?raw', import: 'default', eager: true })

const summaries = TRACKS.flatMap((track) => track.levels.map((level) => ({ track, level })))

describe('контент направлений', () => {
  it('у каждого уровня в индексе есть файл, и лишних файлов нет', () => {
    const files = Object.keys(levels).map((path) => path.replace(/^.*\/(.+)\.json$/, '$1'))

    expect(files.sort()).toEqual(summaries.map(({ level }) => level.id).sort())
  })

  it('у каждого направления известная категория главной', () => {
    const known = TRACK_CATEGORIES.map((category) => category.id)
    for (const track of TRACKS) expect(known).toContain(track.category)
  })

  it.each(summaries)('$level.id совпадает с индексом и корректен', ({ track, level: summary }) => {
    const level = levels[`../data/levels/${summary.id}.json`]
    if (!level) throw new Error(`Нет файла ${summary.id}.json`)

    expect(level.id).toBe(summary.id)
    expect(level.trackId).toBe(track.id)
    expect(level.level).toBe(summary.level)
    expect(level.topics.map((topic) => topic.title)).toEqual(summary.topicTitles)
    expect(level.quiz).toHaveLength(summary.quizCount)
    expect(levelIssues(level)).toEqual([])
  })
})

describe('файлы индекса направлений', () => {
  it.each(TRACK_INDEX_FILES.map((file) => [file.fileName, file] as const))(
    '%s пересобирается из данных байт в байт',
    (fileName, file) => {
      const raw = rawIndexFiles[`../data/${fileName}`]

      expect(raw).toBeDefined()
      expect(`${JSON.stringify(file.tracks, null, 2)}${file.trailingNewline ? '\n' : ''}`).toBe(raw)
    },
  )

  it('каждый уровень описан ровно в одном файле индекса', () => {
    for (const { level } of summaries) {
      const files = TRACK_INDEX_FILES.filter((file) => file.tracks.some((track) => track.levels.some((item) => item.id === level.id)))

      expect(files.map((file) => `${level.id}: ${file.fileName}`)).toHaveLength(1)
      expect(findIndexFile(level.id)).toBe(files[0])
    }
  })
})
