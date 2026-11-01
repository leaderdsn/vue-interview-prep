import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SyncButton from './SyncButton.vue'

import type * as SharedConfig from '@/shared/config'

const firebase = vi.hoisted(() => ({ value: null as object | null }))

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof SharedConfig>()
  return {
    ...actual,
    env: {
      ...actual.env,
      get firebase() {
        return firebase.value
      },
    },
  }
})

describe('SyncButton', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('показывает кнопку входа, когда Firebase настроен', () => {
    firebase.value = { apiKey: 'key', databaseURL: 'https://db.example' }

    const wrapper = mount(SyncButton)

    expect(wrapper.find('button').attributes('aria-label')).toBe('Сохранять прогресс в аккаунте')
  })

  it('ничего не показывает без настроек Firebase', () => {
    firebase.value = null

    const wrapper = mount(SyncButton)

    expect(wrapper.find('button').exists()).toBe(false)
  })
})
