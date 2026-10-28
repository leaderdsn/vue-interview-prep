import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { DARK_MODE_CLASS, THEME_STORAGE_KEY } from '../config/theme'

import { useThemeStore } from './themeStore'

/** Controllable `matchMedia` stub: `setDark` emulates the OS switching color scheme. */
function mockSystemTheme(initialDark: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const query = {
    matches: initialDark,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
  }
  vi.stubGlobal('matchMedia', () => query)

  return {
    setDark(dark: boolean) {
      query.matches = dark
      listeners.forEach((listener) => listener({ matches: dark }))
    },
  }
}

function hasDarkClass() {
  return document.documentElement.classList.contains(DARK_MODE_CLASS)
}

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove(DARK_MODE_CLASS)
    setActivePinia(createPinia())
  })

  it('по умолчанию следует системной теме', () => {
    mockSystemTheme(true)

    const store = useThemeStore()

    expect(store.mode).toBe('system')
    expect(store.theme).toBe('dark')
    expect(hasDarkClass()).toBe(true)
  })

  it('включает светлую тему, когда системная тема недоступна', () => {
    const store = useThemeStore()

    expect(store.mode).toBe('system')
    expect(store.isDark).toBe(false)
  })

  it('восстанавливает выбранный режим из localStorage', () => {
    mockSystemTheme(false)
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    const store = useThemeStore()

    expect(store.mode).toBe('dark')
    expect(hasDarkClass()).toBe(true)
  })

  it('игнорирует неизвестное значение в localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')

    const store = useThemeStore()

    expect(store.mode).toBe('system')
  })

  it('меняет тему вслед за системой в режиме system', async () => {
    const system = mockSystemTheme(false)
    const store = useThemeStore()

    system.setDark(true)
    await nextTick()

    expect(store.theme).toBe('dark')
    expect(hasDarkClass()).toBe(true)
  })

  it('не реагирует на смену системной темы, когда тема выбрана вручную', async () => {
    const system = mockSystemTheme(false)
    const store = useThemeStore()

    store.setMode('light')
    system.setDark(true)
    await nextTick()

    expect(store.theme).toBe('light')
    expect(hasDarkClass()).toBe(false)
  })

  it('применяет выбранный режим и сохраняет его', async () => {
    mockSystemTheme(false)
    const store = useThemeStore()

    store.setMode('dark')
    await nextTick()

    expect(hasDarkClass()).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    store.setMode('system')
    await nextTick()

    expect(hasDarkClass()).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })
})
