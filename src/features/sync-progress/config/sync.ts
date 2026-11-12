/**
 * Путь прогресса пользователя в Realtime Database; database.rules.json открывает его только владельцу
 * с подтверждённой почтой.
 */
export const progressPath = (uid: string) => `interviewPrep/users/${uid}/progress`

export const SYNC_STATUS_LABELS = {
  off: 'Синхронизация выключена',
  connecting: 'Подключение…',
  online: 'Прогресс синхронизирован',
  offline: 'Нет сети — изменения отправятся позже',
  error: 'Ошибка синхронизации',
  unverified: 'Почта не подтверждена — прогресс не сохраняется в аккаунте',
} as const

export type SyncStatus = keyof typeof SYNC_STATUS_LABELS
