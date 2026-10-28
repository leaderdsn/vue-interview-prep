import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { DARK_COLOR_SCHEME_QUERY, DARK_MODE_CLASS, THEME_MODES, THEME_STORAGE_KEY } from '../config/theme'

import type { Theme, ThemeMode } from '../config/theme'

function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode)
}

function readStoredMode(): ThemeMode | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(value) ? value : null
  } catch {
    return null
  }
}

function storeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Storage may be unavailable (private mode) — theme still applies for the session.
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle(DARK_MODE_CLASS, theme === 'dark')
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(readStoredMode() ?? 'system')

  // matchMedia is missing in some non-browser environments (e.g. jsdom).
  const darkQuery = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_COLOR_SCHEME_QUERY) : null
  const systemTheme = ref<Theme>(darkQuery?.matches ? 'dark' : 'light')

  // The store lives as long as the app, so the listener is never removed.
  darkQuery?.addEventListener('change', (event) => {
    systemTheme.value = event.matches ? 'dark' : 'light'
  })

  const theme = computed<Theme>(() => (mode.value === 'system' ? systemTheme.value : mode.value))
  const isDark = computed(() => theme.value === 'dark')

  watch(theme, applyTheme, { immediate: true })
  watch(mode, storeMode)

  function setMode(value: ThemeMode) {
    mode.value = value
  }

  return { mode, theme, isDark, setMode }
})
