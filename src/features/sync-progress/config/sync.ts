/** Set while the user wants sync, so the Firebase SDK loads on start only for those who use it. */
export const SYNC_ENABLED_KEY = 'vue-interview-prep:sync'

/** Realtime Database path of a user's progress; database.rules.json allows it to its owner only. */
export const progressPath = (uid: string) => `interviewPrep/users/${uid}/progress`

export const SYNC_STATUS_LABELS = {
  off: 'Синхронизация выключена',
  connecting: 'Подключение…',
  online: 'Прогресс синхронизирован',
  offline: 'Нет сети — изменения отправятся позже',
  error: 'Ошибка синхронизации',
} as const

export type SyncStatus = keyof typeof SYNC_STATUS_LABELS
