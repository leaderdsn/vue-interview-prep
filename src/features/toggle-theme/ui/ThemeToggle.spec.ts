import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useThemeStore } from '../model/themeStore'

import ThemeToggle from './ThemeToggle.vue'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('показывает три режима с доступными подписями', () => {
    const wrapper = mount(ThemeToggle)
    const buttons = wrapper.findAll('button')

    expect(buttons.map((button) => button.text())).toEqual(['Светлая тема', 'Тёмная тема', 'Как в системе'])
  })

  it('отмечает текущий режим', () => {
    const wrapper = mount(ThemeToggle)
    const pressed = wrapper.findAll('button').filter((button) => button.attributes('aria-pressed') === 'true')

    expect(pressed.map((button) => button.text())).toEqual(['Как в системе'])
  })

  it('переключает режим по клику', async () => {
    const wrapper = mount(ThemeToggle)
    const store = useThemeStore()

    await wrapper.findAll('button')[1]?.trigger('click')

    expect(store.mode).toBe('dark')
    expect(store.isDark).toBe(true)
  })

  it('не снимает выбор при повторном клике', async () => {
    const wrapper = mount(ThemeToggle)
    const store = useThemeStore()

    await wrapper.findAll('button')[2]?.trigger('click')

    expect(store.mode).toBe('system')
  })
})
