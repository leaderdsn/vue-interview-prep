import { describe, expect, it } from 'vitest'

import { findIndexFile, TRACK_INDEX_FILES } from '@/entities/track'

import { buildIndexFile } from './indexFile'

import type { Track } from '@/entities/track'

describe('индекс направлений для репозитория', () => {
  it('выбирает файл, где описан уровень: базовые направления и добавленные позже', () => {
    expect(findIndexFile('vue-junior')?.fileName).toBe('tracks.json')
    expect(findIndexFile('keycloak-junior')?.fileName).toBe('tracks-extra.json')
    expect(findIndexFile('нет-такого')).toBeNull()
  })

  it.each(TRACK_INDEX_FILES.map((file) => [file.fileName, file] as const))(
    '%s: меняются только заголовки тем и число вопросов уровня',
    (_name, file) => {
      const target = file.tracks[0]?.levels[1]
      if (!target) throw new Error('В индексе нет уровней')
      const topics = [...target.topicTitles, 'Новая тема'].map((title) => ({ title }))

      const text = buildIndexFile(file, target.id, topics, target.quizCount + 1)
      const tracks = JSON.parse(text) as Track[]
      const changed = tracks.flatMap((track) => track.levels).find((level) => level.id === target.id)

      expect(changed).toEqual({ ...target, topicTitles: [...target.topicTitles, 'Новая тема'], quizCount: target.quizCount + 1 })
      // Остальное — как в исходном файле, вместе с форматированием и переводом строки в конце.
      expect(text.endsWith('\n')).toBe(file.trailingNewline)
      expect(buildIndexFile(file, target.id, target.topicTitles.map((title) => ({ title })), target.quizCount)).toBe(
        `${JSON.stringify(file.tracks, null, 2)}${file.trailingNewline ? '\n' : ''}`,
      )
      expect(tracks.flatMap((track) => track.levels).filter((level) => level.id !== target.id)).toEqual(
        file.tracks.flatMap((track) => track.levels).filter((level) => level.id !== target.id),
      )
    },
  )
})
