import extractedTracks from '../data/tracks.json'
import extraTracks from '../data/tracks-extra.json'

import { fetchPublicData } from '@/shared/lib'

import { applyOverride, contentPath, parseOverride } from './overrides'

import type { Level, LevelName, LevelSummary, Track } from '../model/types'

/** Файл индекса направлений в `data/`: для кнопки «Скачать индекс направлений» в редакторе. */
export type TrackIndexFile = {
  fileName: 'tracks.json' | 'tracks-extra.json'
  tracks: readonly Track[]
  /** Заканчивается ли файл переводом строки: скачанный файл должен отличаться от исходного только правкой. */
  trailingNewline: boolean
}

/** Оба файла индекса по отдельности (их формат сверяет content.spec.ts). */
export const TRACK_INDEX_FILES: readonly TrackIndexFile[] = [
  { fileName: 'tracks.json', tracks: extractedTracks as Track[], trailingNewline: false },
  { fileName: 'tracks-extra.json', tracks: extraTracks as Track[], trailingNewline: true },
]

/** Базовые направления плюс добавленные позже (tracks-extra.json). */
export const TRACKS = TRACK_INDEX_FILES.flatMap((file) => file.tracks)

/** Файл индекса, в котором описан уровень. */
export function findIndexFile(levelId: string): TrackIndexFile | null {
  return TRACK_INDEX_FILES.find((file) => file.tracks.some((track) => track.levels.some((level) => level.id === levelId))) ?? null
}

export const LEVEL_LABELS: Readonly<Record<LevelName, string>> = {
  junior: 'Junior',
  middle: 'Middle',
  senior: 'Senior',
}

// Каждый уровень — отдельный чанк: главная загружает только индекс выше.
const levelModules = import.meta.glob<Level>('../data/levels/*.json', { import: 'default' })

export function findLevel(levelId: string): { track: Track; level: LevelSummary } | null {
  for (const track of TRACKS) {
    const level = track.levels.find((item) => item.id === levelId)
    if (level) return { track, level }
  }
  return null
}

/** Уровень из сборки приложения, без правок из админки. */
export async function fetchBundledLevel(levelId: string): Promise<Level> {
  const load = levelModules[`../data/levels/${levelId}.json`]
  if (!load) throw new Error(`Уровень «${levelId}» не найден`)
  return load()
}

/**
 * Уровень с тестом и темами, отредактированными в админке, если правка есть. Правка читается через REST
 * (без SDK Firebase у читателей) с коротким таймаутом; без сети, при ошибке или некорректной правке
 * используется версия из сборки. HTML тем из базы очищается по белому списку (`lib/sanitize.ts`).
 */
export async function fetchLevel(levelId: string): Promise<Level> {
  const [level, override] = await Promise.all([fetchBundledLevel(levelId), fetchPublicData(contentPath(levelId))])
  return applyOverride(level, parseOverride(override))
}
