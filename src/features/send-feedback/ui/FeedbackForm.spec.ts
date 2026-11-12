import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessionStore } from '@/entities/session'

import { useFeedbackStore } from '../model/feedbackStore'

import FeedbackForm from './FeedbackForm.vue'

import type * as SharedLib from '@/shared/lib'

const TIMESTAMP = { '.sv': 'timestamp' }

const fake = vi.hoisted(() => ({
  update: vi.fn(),
  signInAnonymously: vi.fn(),
  trackEvent: vi.fn(),
  currentUser: null as null | { uid: string },
}))

// Вместо SDK Firebase — заглушки входа и базы; запись только запоминается.
vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedLib>()),
  isFirebaseConfigured: () => true,
  trackEvent: fake.trackEvent,
  loadFirebase: () =>
    Promise.resolve({
      auth: {
        authStateReady: () => Promise.resolve(),
        get currentUser() {
          return fake.currentUser
        },
      },
      authApi: { signInAnonymously: fake.signInAnonymously },
      db: {},
      dbApi: {
        ref: (_db: unknown, path = '') => path,
        push: () => ({ key: 'f1' }),
        serverTimestamp: () => ({ '.sv': 'timestamp' }),
        update: fake.update,
      },
    }),
}))

// Dialog телепортирует содержимое в body; для проверки формы достаточно его слота.
const DialogStub = { name: 'Dialog', template: '<div class="dialog-stub"><slot /></div>' }

function mountForm() {
  return mount(FeedbackForm, { global: { stubs: { Dialog: DialogStub } } })
}

function openFromSelection() {
  useFeedbackStore().open('typo', {
    page: '/level/vue-junior/2',
    levelId: 'vue-junior',
    step: 2,
    topicTitle: 'Компоненты',
    quote: 'компонетн',
  })
}

describe('FeedbackForm', () => {
  beforeEach(() => {
    localStorage.clear()
    fake.currentUser = null
    // Select из PrimeVue подписывается на ориентацию экрана, а в jsdom нет matchMedia.
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    // Textarea с auto-resize следит за размером, а в jsdom нет ResizeObserver.
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    fake.update.mockResolvedValue(undefined)
    fake.signInAnonymously.mockImplementation(() => {
      fake.currentUser = { uid: 'anon' }
      return Promise.resolve({ user: { uid: 'anon' } })
    })
    setActivePinia(createPinia())
  })

  it('показывает контекст и не отправляет слишком короткий комментарий', async () => {
    openFromSelection()
    const wrapper = mountForm()

    expect(wrapper.text()).toContain('vue-junior · тема 2 «Компоненты»')
    expect(wrapper.find('blockquote').text()).toBe('компонетн')

    await wrapper.find('textarea').setValue('abc')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Опишите замечание: хотя бы 5 символов')
    expect(fake.update).not.toHaveBeenCalled()
  })

  it('отправляет замечание и отметку частоты одним update, затем закрывается с благодарностью', async () => {
    openFromSelection()
    const feedback = useFeedbackStore()
    const wrapper = mountForm()

    await wrapper.find('textarea').setValue('  Опечатка в слове  ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(fake.signInAnonymously).toHaveBeenCalledTimes(1)
    expect(fake.update).toHaveBeenCalledTimes(1)
    const [path, values] = fake.update.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('')
    expect(values).toEqual({
      'interviewPrep/feedback/f1': {
        kind: 'typo',
        text: 'Опечатка в слове',
        page: '/level/vue-junior/2',
        levelId: 'vue-junior',
        step: 2,
        topicTitle: 'Компоненты',
        quote: 'компонетн',
        appVersion: expect.any(String) as string,
        createdAt: TIMESTAMP,
        uid: 'anon',
        status: 'new',
      },
      'interviewPrep/feedbackLimits/anon': { at: TIMESTAMP, item: 'f1' },
    })
    expect(fake.trackEvent).toHaveBeenCalledWith('feedback_sent', { kind: 'typo' })
    expect(feedback.visible).toBe(false)
    expect(feedback.notice).toBe('Спасибо! Замечание отправлено')
    expect(useSessionStore().user).toBeNull()
  })

  it('подставляет почту вошедшего пользователя и пишет от его имени', async () => {
    const session = useSessionStore()
    session.user = { uid: 'u1', name: '', email: 'me@example.com', photoUrl: null, emailVerified: true }
    fake.currentUser = { uid: 'u1' }
    useFeedbackStore().open('suggestion', { page: '/' })
    const wrapper = mountForm()
    await flushPromises()

    expect((wrapper.find('input[type="email"]').element as HTMLInputElement).value).toBe('me@example.com')

    await wrapper.find('textarea').setValue('Добавьте тёмную тему для кода')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const values = fake.update.mock.calls[0]?.[1] as Record<string, Record<string, unknown>>
    expect(values['interviewPrep/feedback/f1']).toMatchObject({ uid: 'u1', email: 'me@example.com', kind: 'suggestion' })
    expect(fake.signInAnonymously).not.toHaveBeenCalled()
  })

  it('показывает понятную ошибку, если правила отклонили запись', async () => {
    fake.update.mockRejectedValue(Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' }))
    openFromSelection()
    const feedback = useFeedbackStore()
    const wrapper = mountForm()

    await wrapper.find('textarea').setValue('Опечатка в слове')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Слишком часто')
    expect(feedback.visible).toBe(true)
  })

  it('не обращается к базе, если с прошлой отправки не прошло 30 секунд', async () => {
    openFromSelection()
    const feedback = useFeedbackStore()
    feedback.lastSentAt = Date.now()
    const wrapper = mountForm()

    await wrapper.find('textarea').setValue('Ещё одна опечатка')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Слишком часто')
    expect(fake.update).not.toHaveBeenCalled()
  })
})
