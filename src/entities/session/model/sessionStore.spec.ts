import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import EmailSignIn from '../ui/EmailSignIn.vue'

import { authErrorMessage, useSessionStore } from './sessionStore'

import type * as SharedLib from '@/shared/lib'

const authApi = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
}))

const currentUser = vi.hoisted(() => ({
  uid: 'u1',
  displayName: null,
  email: 'me@example.com',
  photoURL: null,
  emailVerified: false,
  reload: vi.fn(),
  getIdToken: vi.fn(),
}))

// Вместо SDK Firebase — заглушки методов входа.
vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedLib>()),
  isFirebaseConfigured: () => true,
  loadFirebase: () => Promise.resolve({ auth: { name: 'auth', currentUser }, authApi }),
}))

const authError = (code: string) => Object.assign(new Error(code), { code })

describe('sessionStore: вход по почте', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('входит по почте и паролю, обрезая пробелы в адресе', async () => {
    authApi.signInWithEmailAndPassword.mockResolvedValue({})
    const session = useSessionStore()

    await expect(session.signInWithEmail('  me@example.com ', 'secret')).resolves.toBe(true)

    expect(authApi.signInWithEmailAndPassword).toHaveBeenCalledWith(expect.objectContaining({ name: 'auth' }), 'me@example.com', 'secret')
    expect(session.error).toBeNull()
    expect(session.busy).toBe(false)
  })

  it('показывает понятную ошибку при неверном пароле', async () => {
    authApi.signInWithEmailAndPassword.mockRejectedValue(authError('auth/invalid-credential'))
    const session = useSessionStore()

    await expect(session.signInWithEmail('me@example.com', 'wrong')).resolves.toBe(false)

    expect(session.error).toBe('Неверная почта или пароль')
  })

  it('регистрирует аккаунт, отправляет письмо для подтверждения и письмо для сброса пароля', async () => {
    const created = { uid: 'new' }
    authApi.createUserWithEmailAndPassword.mockResolvedValue({ user: created })
    authApi.sendEmailVerification.mockResolvedValue(undefined)
    authApi.sendPasswordResetEmail.mockResolvedValue(undefined)
    const session = useSessionStore()

    await expect(session.signUpWithEmail('new@example.com', 'secret1')).resolves.toBe(true)
    await expect(session.resetPassword('new@example.com')).resolves.toBe(true)

    expect(authApi.createUserWithEmailAndPassword).toHaveBeenCalledWith(expect.objectContaining({ name: 'auth' }), 'new@example.com', 'secret1')
    expect(authApi.sendPasswordResetEmail).toHaveBeenCalledWith(expect.objectContaining({ name: 'auth' }), 'new@example.com')
    expect(authApi.sendEmailVerification).toHaveBeenCalledWith(created)
  })

  it('после перехода по ссылке обновляет аккаунт и токен', async () => {
    const session = useSessionStore()
    session.user = { uid: 'u1', name: '', email: 'me@example.com', photoUrl: null, emailVerified: false }
    currentUser.reload.mockImplementation(() => {
      currentUser.emailVerified = true
      return Promise.resolve()
    })

    await expect(session.refreshVerification()).resolves.toBe(true)

    expect(currentUser.getIdToken).toHaveBeenCalledWith(true)
    expect(session.user?.emailVerified).toBe(true)
  })

  it('пока почта не подтверждена, токен не обновляется', async () => {
    const session = useSessionStore()
    currentUser.emailVerified = false
    currentUser.reload.mockResolvedValue(undefined)

    await expect(session.refreshVerification()).resolves.toBe(false)

    expect(currentUser.getIdToken).not.toHaveBeenCalled()
  })

  it('незнакомую ошибку показывает как есть', () => {
    expect(authErrorMessage(authError('auth/email-already-in-use'))).toContain('уже есть')
    expect(authErrorMessage(new Error('Что-то сломалось'))).toBe('Что-то сломалось')
  })
})

describe('EmailSignIn', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  const mountForm = () => mount(EmailSignIn, { global: { plugins: [PrimeVue] } })

  it('отправляет почту и пароль при входе', async () => {
    authApi.signInWithEmailAndPassword.mockResolvedValue({})
    const wrapper = mountForm()

    await wrapper.find('input[type="email"]').setValue('me@example.com')
    await wrapper.find('input[type="password"]').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(authApi.signInWithEmailAndPassword).toHaveBeenCalledWith(expect.objectContaining({ name: 'auth' }), 'me@example.com', 'secret')
  })

  it('в режиме восстановления скрывает пароль и сообщает об отправленном письме', async () => {
    authApi.sendPasswordResetEmail.mockResolvedValue(undefined)
    const wrapper = mountForm()

    await wrapper.findAll('button').find((button) => button.text() === 'Забыли пароль?')!.trigger('click')
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)

    await wrapper.find('input[type="email"]').setValue('me@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Письмо отправлено на me@example.com')
  })

  it('показывает и скрывает пароль', async () => {
    const wrapper = mountForm()
    const eye = wrapper.find('button[aria-controls]')

    expect(eye.attributes('aria-label')).toBe('Показать пароль')
    await eye.trigger('click')
    expect(wrapper.find('input[autocomplete="current-password"]').attributes('type')).toBe('text')
    expect(eye.attributes('aria-pressed')).toBe('true')

    await eye.trigger('click')
    expect(wrapper.find('input[autocomplete="current-password"]').attributes('type')).toBe('password')
  })

  it('не даёт создать аккаунт с коротким паролем', async () => {
    const wrapper = mountForm()

    await wrapper.findAll('button').find((button) => button.text() === 'Создать аккаунт')!.trigger('click')
    await wrapper.find('input[type="email"]').setValue('me@example.com')
    await wrapper.find('input[type="password"]').setValue('123')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(authApi.createUserWithEmailAndPassword).not.toHaveBeenCalled()
  })
})
