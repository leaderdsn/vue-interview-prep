import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessionStore } from '@/entities/session'

import { useSyncStore } from '../model/syncStore'

import SyncButton from './SyncButton.vue'

import type * as SharedConfig from '@/shared/config'
import type * as SharedLib from '@/shared/lib'

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

// В тестах SDK не загружается: иначе вошедший пользователь подключился бы к базе.
vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedLib>()),
  loadFirebase: () => new Promise(() => {}),
}))

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

  it('показывает аккаунт, с которым синхронизирован прогресс', async () => {
    firebase.value = { apiKey: 'key', databaseURL: 'https://db.example' }
    const wrapper = mount(SyncButton)
    const sync = useSyncStore()

    useSessionStore().user = { uid: 'u1', name: 'Иван Петров', email: 'ivan@example.com', photoUrl: null, emailVerified: true }
    sync.status = 'online'
    await wrapper.vm.$nextTick()
    const button = wrapper.find('button')

    expect(button.text()).toContain('Иван')
    expect(button.find('.sync-button__initial').text()).toBe('И')
    expect(button.attributes('aria-label')).toBe('Аккаунт ivan@example.com: Прогресс синхронизирован')
  })

  it('предупреждает, что без подтверждённой почты прогресс не сохраняется', async () => {
    firebase.value = { apiKey: 'key', databaseURL: 'https://db.example' }
    const wrapper = mount(SyncButton, { attachTo: document.body })
    const sync = useSyncStore()

    useSessionStore().user = { uid: 'u2', name: '', email: 'new@example.com', photoUrl: null, emailVerified: false }
    await wrapper.vm.$nextTick()

    expect(sync.status).toBe('unverified')
    expect(wrapper.find('button').attributes('aria-label')).toBe(
      'Аккаунт new@example.com: Почта не подтверждена — прогресс не сохраняется в аккаунте',
    )
    expect(wrapper.find('.sync-button__dot--unverified').exists()).toBe(true)
    wrapper.unmount()
  })
})
