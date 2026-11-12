import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SIGNED_IN_KEY } from '../config/session'

import { toSessionUser, useSessionStore } from './sessionStore'

import type * as SharedLib from '@/shared/lib'

type Account = { uid: string; isAnonymous: boolean; displayName: string | null; email: string | null; photoURL: string | null; emailVerified: boolean }

const fake = vi.hoisted(() => ({
  currentUser: null as null | { uid: string; isAnonymous: boolean },
  listener: null as null | ((account: unknown) => void),
}))

const authApi = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithPopup: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}))

// Вместо SDK Firebase — заглушка Auth с текущим аккаунтом и подпиской на смену входа.
vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedLib>()),
  isFirebaseConfigured: () => true,
  loadFirebase: () =>
    Promise.resolve({
      auth: {
        authStateReady: () => Promise.resolve(),
        get currentUser() {
          return fake.currentUser
        },
      },
      authApi,
    }),
}))

const anonymousAccount: Account = { uid: 'anon', isAnonymous: true, displayName: null, email: null, photoURL: null, emailVerified: false }
const googleAccount: Account = { uid: 'g1', isAnonymous: false, displayName: 'Иван', email: 'ivan@example.com', photoURL: null, emailVerified: true }

describe('sessionStore: анонимный аккаунт для замечаний', () => {
  beforeEach(() => {
    localStorage.clear()
    fake.currentUser = null
    fake.listener = null
    authApi.onAuthStateChanged.mockImplementation((_auth: unknown, listener: (account: unknown) => void) => {
      fake.listener = listener
    })
    authApi.signInAnonymously.mockImplementation(() => {
      fake.currentUser = anonymousAccount
      fake.listener?.(anonymousAccount)
      return Promise.resolve({ user: anonymousAccount })
    })
    setActivePinia(createPinia())
  })

  it('анонимный аккаунт не считается пользователем', () => {
    expect(toSessionUser(anonymousAccount)).toBeNull()
    expect(toSessionUser(null)).toBeNull()
    expect(toSessionUser(googleAccount)).toMatchObject({ uid: 'g1', email: 'ivan@example.com' })
  })

  it('без входа входит анонимно, но не запоминает вход и не показывает пользователя', async () => {
    const session = useSessionStore()

    await expect(session.ensureUid()).resolves.toBe('anon')

    expect(authApi.signInAnonymously).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(SIGNED_IN_KEY)).toBeNull()
    expect(session.user).toBeNull()
  })

  it('повторно использует уже вошедший аккаунт — и анонимный, и настоящий', async () => {
    const session = useSessionStore()

    fake.currentUser = anonymousAccount
    await expect(session.ensureUid()).resolves.toBe('anon')
    fake.currentUser = googleAccount
    await expect(session.ensureUid()).resolves.toBe('g1')

    expect(authApi.signInAnonymously).not.toHaveBeenCalled()
  })

  it('подписка на вход пропускает анонимный аккаунт, а вход через Google после него работает как обычно', async () => {
    localStorage.setItem(SIGNED_IN_KEY, '1')
    const session = useSessionStore()
    session.init()
    await flushPromises()

    fake.listener?.(anonymousAccount)
    expect(session.user).toBeNull()

    localStorage.clear()
    authApi.signInWithPopup.mockImplementation(() => {
      fake.currentUser = googleAccount
      fake.listener?.(googleAccount)
      return Promise.resolve({})
    })
    await expect(session.signIn()).resolves.toBe(true)

    expect(session.user).toMatchObject({ uid: 'g1', emailVerified: true })
    expect(localStorage.getItem(SIGNED_IN_KEY)).toBe('1')
  })
})
