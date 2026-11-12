/** Тема, фактически применённая к странице. */
export type Theme = 'light' | 'dark'

/** Тема, выбранная пользователем; `system` следует настройке ОС. */
export type ThemeMode = Theme | 'system'

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

export const THEME_MODE_OPTIONS: readonly { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Светлая тема', icon: 'pi pi-sun' },
  { value: 'dark', label: 'Тёмная тема', icon: 'pi pi-moon' },
  { value: 'system', label: 'Как в системе', icon: 'pi pi-desktop' },
]

// THEME_STORAGE_KEY и DARK_MODE_CLASS продублированы во встроенном скрипте в index.html
// (применяет тему до первой отрисовки) — меняйте их вместе.
export const THEME_STORAGE_KEY = 'app:theme'

export const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

/** Должен совпадать с `darkModeSelector` в app/providers/primevue.ts. */
export const DARK_MODE_CLASS = 'app-dark'
