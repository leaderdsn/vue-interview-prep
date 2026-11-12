import type { Topic, TrackIndexFile } from '@/entities/track'

/**
 * Текст файла индекса направлений (`tracks.json` или `tracks-extra.json`) с заголовками тем и числом вопросов
 * уровня из редактора. Остальные уровни и форматирование остаются как в репозитории, поэтому в диффе — только этот уровень.
 * Вместе с JSON уровня файл делает новые темы видимыми на главной, в пререндере и в sitemap, а `content.spec.ts` — зелёным.
 */
export function buildIndexFile(
  file: TrackIndexFile,
  levelId: string,
  topics: readonly Pick<Topic, 'title'>[],
  quizCount: number,
): string {
  const tracks = file.tracks.map((track) => ({
    ...track,
    levels: track.levels.map((level) =>
      level.id === levelId ? { ...level, topicTitles: topics.map((topic) => topic.title), quizCount } : level,
    ),
  }))
  return `${JSON.stringify(tracks, null, 2)}${file.trailingNewline ? '\n' : ''}`
}
