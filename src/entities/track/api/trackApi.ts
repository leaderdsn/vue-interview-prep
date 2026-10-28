import extractedTracks from '../data/tracks.json'
import extraTracks from '../data/tracks-extra.json'

import type { Level, LevelName, LevelSummary, Track } from '../model/types'

/** Base tracks plus tracks added later (tracks-extra.json). */
export const TRACKS = [...extractedTracks, ...extraTracks] as Track[]

export const LEVEL_LABELS: Readonly<Record<LevelName, string>> = {
  junior: 'Junior',
  middle: 'Middle',
  senior: 'Senior',
}

// Each level is a separate chunk: the home page loads only the index above.
const levelModules = import.meta.glob<Level>('../data/levels/*.json', { import: 'default' })

export function findLevel(levelId: string): { track: Track; level: LevelSummary } | null {
  for (const track of TRACKS) {
    const level = track.levels.find((item) => item.id === levelId)
    if (level) return { track, level }
  }
  return null
}

export async function fetchLevel(levelId: string): Promise<Level> {
  const load = levelModules[`../data/levels/${levelId}.json`]
  if (!load) throw new Error(`Уровень «${levelId}» не найден`)
  return load()
}
