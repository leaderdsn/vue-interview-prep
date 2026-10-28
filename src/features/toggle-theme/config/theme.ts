/** Theme actually applied to the page. */
export type Theme = 'light' | 'dark'

/** Theme preference chosen by the user; `system` follows the OS setting. */
export type ThemeMode = Theme | 'system'

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

export const THEME_MODE_OPTIONS: readonly { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Светлая тема', icon: 'pi pi-sun' },
  { value: 'dark', label: 'Тёмная тема', icon: 'pi pi-moon' },
  { value: 'system', label: 'Как в системе', icon: 'pi pi-desktop' },
]

// THEME_STORAGE_KEY and DARK_MODE_CLASS are duplicated in the inline script in index.html
// (applies the theme before first paint) — change them together.
export const THEME_STORAGE_KEY = 'app:theme'

export const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

/** Must match `darkModeSelector` in app/providers/primevue.ts. */
export const DARK_MODE_CLASS = 'app-dark'
