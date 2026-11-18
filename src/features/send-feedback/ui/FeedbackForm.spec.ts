import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessionStore } from '@/entities/session'

import { useFeedbackStore } from '../model/feedbackStore'

import FeedbackForm from './FeedbackForm.vue'

import type * as Codec from '../lib/imageCodec'
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

// В jsdom нет createImageBitmap и canvas: декодирование и кодирование подменены, сигнатура файла читается настоящая.
const codec = vi.hoisted(() => ({ encoded: 0 }))

vi.mock('../lib/imageCodec', async (importOriginal) => ({
  ...(await importOriginal<typeof Codec>()),
  decodeImage: () => Promise.resolve({ width: 2400, height: 1200, source: {}, close: () => {} }),
  encodeImage: () => `data:image/webp;base64,SHOT${++codec.encoded}`,
}))

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0])
const png = (name = 'shot.png') => new File([PNG_BYTES], name, { type: 'image/png' })
const gif = () => new File([GIF_BYTES], 'anim.gif', { type: 'image/gif' })

/** Похожее на DataTransfer: файлы и типы, как у вставки скриншота или перетаскивания файла. */
const transfer = (files: File[], text = '') => ({
  files,
  items: [],
  types: files.length ? ['Files'] : ['text/plain'],
  getData: (type: string) => (type === 'text/plain' ? text : ''),
})

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
        imageCount: 0,
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

describe('FeedbackForm: изображения', () => {
  beforeEach(() => {
    localStorage.clear()
    fake.currentUser = { uid: 'anon' }
    codec.encoded = 0
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    fake.update.mockResolvedValue(undefined)
    setActivePinia(createPinia())
  })

  const previews = (wrapper: ReturnType<typeof mountForm>) => wrapper.findAll('.feedback-form__image img')

  it('вставка скриншота из буфера (Ctrl+V) добавляет превью, а вставку текста не трогает', async () => {
    openFromSelection()
    const wrapper = mountForm()

    expect(wrapper.text()).toContain('Не прикладывайте скриншоты с личными данными')

    await wrapper.find('textarea').trigger('paste', { clipboardData: transfer([], 'просто текст') })
    await flushPromises()
    expect(previews(wrapper)).toHaveLength(0)

    await wrapper.find('textarea').trigger('paste', { clipboardData: transfer([png()]) })
    await flushPromises()

    expect(previews(wrapper)).toHaveLength(1)
    expect(previews(wrapper)[0]?.attributes('src')).toBe('data:image/webp;base64,SHOT1')
  })

  it('перетаскивание файлов добавляет не больше двух картинок и предупреждает о лишних', async () => {
    openFromSelection()
    const wrapper = mountForm()
    const form = wrapper.find('form')

    await form.trigger('dragover', { dataTransfer: transfer([png()]) })
    expect(form.classes()).toContain('feedback-form--dragging')

    await form.trigger('drop', { dataTransfer: transfer([png('a.png'), png('b.png'), png('c.png')]) })
    await flushPromises()

    expect(form.classes()).not.toContain('feedback-form--dragging')
    expect(previews(wrapper)).toHaveLength(2)
    expect(wrapper.text()).toContain('Можно приложить не больше 2 картинок')
    const attach = wrapper.findAll('button').find((button) => button.text() === 'Прикрепить изображение')!
    expect(attach.attributes('disabled')).toBeDefined()
  })

  it('выбор файла кнопкой: GIF отклоняется с понятным сообщением', async () => {
    openFromSelection()
    const wrapper = mountForm()
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [gif()], configurable: true })

    await input.trigger('change')
    await flushPromises()

    expect(previews(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('Подходят только картинки PNG, JPEG и WebP')
  })

  it('«Убрать» удаляет превью', async () => {
    openFromSelection()
    const wrapper = mountForm()
    await wrapper.find('form').trigger('drop', { dataTransfer: transfer([png('a.png'), png('b.png')]) })
    await flushPromises()

    await wrapper.find('button[aria-label="Убрать изображение 1"]').trigger('click')

    expect(previews(wrapper).map((img) => img.attributes('src'))).toEqual(['data:image/webp;base64,SHOT2'])
  })

  it('отправляет картинки тем же многопутевым update, что и замечание', async () => {
    openFromSelection()
    const wrapper = mountForm()
    await wrapper.find('textarea').setValue('Съехала таблица')
    await wrapper.find('form').trigger('drop', { dataTransfer: transfer([png('a.png'), png('b.png')]) })
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(fake.update).toHaveBeenCalledTimes(1)
    const values = fake.update.mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(values)).toEqual([
      'interviewPrep/feedback/f1',
      'interviewPrep/feedbackImages/f1',
      'interviewPrep/feedbackLimits/anon',
    ])
    expect(values['interviewPrep/feedback/f1']).toMatchObject({ imageCount: 2, text: 'Съехала таблица' })
    expect(values['interviewPrep/feedbackImages/f1']).toEqual({
      0: 'data:image/webp;base64,SHOT1',
      1: 'data:image/webp;base64,SHOT2',
    })
  })

  it('при новом открытии формы картинки сбрасываются', async () => {
    openFromSelection()
    const wrapper = mountForm()
    await wrapper.find('form').trigger('drop', { dataTransfer: transfer([png()]) })
    await flushPromises()
    expect(previews(wrapper)).toHaveLength(1)

    useFeedbackStore().open('suggestion', { page: '/' })
    await flushPromises()

    expect(previews(wrapper)).toHaveLength(0)
  })
})
