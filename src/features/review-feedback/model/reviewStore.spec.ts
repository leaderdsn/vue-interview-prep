import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import FeedbackReview from '../ui/FeedbackReview.vue'

import { countByStatus, filterFeedback, useReviewStore } from './reviewStore'

import type { FeedbackItem } from '@/entities/feedback'
import type * as SharedLib from '@/shared/lib'

type Tree = Record<string, unknown>
const db = vi.hoisted(() => ({ root: {}, update: vi.fn(), remove: vi.fn() }))

// Вместо SDK Firebase — дерево в памяти: чтение списка, update и remove по пути.
vi.mock('@/shared/lib', async (importOriginal) => {
  const keys = (path: string) => path.split('/').filter(Boolean)
  const node = (path: string) => keys(path).reduce<unknown>((value, key) => (value as Tree | undefined)?.[key], db.root)
  return {
    ...(await importOriginal<typeof SharedLib>()),
    loadFirebase: () =>
      Promise.resolve({
        db: {},
        dbApi: {
          ref: (_db: unknown, path: string) => path,
          query: (path: string) => path,
          orderByChild: () => null,
          limitToLast: () => null,
          get: (path: string) => Promise.resolve({ val: () => node(path) ?? null }),
          update: (path: string, values: Tree) => {
            db.update(path, values)
            const target = node(path) as Tree
            for (const [key, value] of Object.entries(values)) {
              if (value === null) delete target[key]
              else target[key] = value
            }
            return Promise.resolve()
          },
          remove: (path: string) => {
            db.remove(path)
            const parts = keys(path)
            const last = parts.pop()!
            delete (node(parts.join('/')) as Tree)[last]
            return Promise.resolve()
          },
        },
      }),
  }
})

const record = (status: string, createdAt: number, extra: Tree = {}) => ({
  kind: 'typo',
  text: `Замечание ${createdAt}`,
  page: '/level/vue-junior/1',
  levelId: 'vue-junior',
  step: 1,
  appVersion: '0.1.0',
  createdAt,
  uid: 'u1',
  status,
  ...extra,
})

const item = (id: string, status: FeedbackItem['status'], createdAt: number) =>
  ({ id, ...record(status, createdAt) }) as FeedbackItem

describe('filterFeedback и countByStatus', () => {
  const items = [item('a', 'new', 3), item('b', 'fixed', 2), item('c', 'new', 1)]

  it('оставляет замечания с выбранным статусом в исходном порядке', () => {
    expect(filterFeedback(items, 'new').map((value) => value.id)).toEqual(['a', 'c'])
    expect(filterFeedback(items, 'rejected')).toEqual([])
    expect(filterFeedback(items, 'all')).toHaveLength(3)
  })

  it('считает замечания по статусам', () => {
    expect(countByStatus(items)).toEqual({ new: 2, in_progress: 0, fixed: 1, rejected: 0, all: 3 })
  })
})

describe('useReviewStore', () => {
  beforeEach(() => {
    db.root = {
      interviewPrep: {
        feedback: {
          old: record('fixed', 1),
          fresh: record('new', 5, { quote: 'цитата', email: 'me@example.com' }),
          mid: record('new', 3),
        },
      },
    }
    setActivePinia(createPinia())
  })

  it('загружает список новыми сверху и считает новые', async () => {
    const review = useReviewStore()

    await review.load()

    expect(review.items.map((value) => value.id)).toEqual(['fresh', 'mid', 'old'])
    expect(review.newCount).toBe(2)
    expect(review.visible.map((value) => value.id)).toEqual(['fresh', 'mid'])
  })

  it('меняет статус и заметку в базе и в списке', async () => {
    const review = useReviewStore()
    await review.load()

    await expect(review.setStatus('fresh', 'in_progress')).resolves.toBe(true)
    await review.saveNote('fresh', '  Поправлю в следующем релизе ')

    expect(db.update).toHaveBeenCalledWith('interviewPrep/feedback/fresh', { status: 'in_progress' })
    expect(db.update).toHaveBeenCalledWith('interviewPrep/feedback/fresh', { adminNote: 'Поправлю в следующем релизе' })
    expect(review.newCount).toBe(1)
    expect(review.items[0]).toMatchObject({ status: 'in_progress', adminNote: 'Поправлю в следующем релизе' })

    await review.saveNote('fresh', '')
    expect(review.items[0]).not.toHaveProperty('adminNote')
  })

  it('удаляет замечание', async () => {
    const review = useReviewStore()
    await review.load()

    await review.remove('old')

    expect(db.remove).toHaveBeenCalledWith('interviewPrep/feedback/old')
    expect(review.items.map((value) => value.id)).toEqual(['fresh', 'mid'])
  })
})

describe('FeedbackReview', () => {
  beforeEach(() => {
    db.root = { interviewPrep: { feedback: { fresh: record('new', 5, { quote: 'цитата' }), old: record('fixed', 1) } } }
    // Select из PrimeVue подписывается на ориентацию экрана, а в jsdom нет matchMedia.
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    // Textarea с auto-resize следит за размером, а в jsdom нет ResizeObserver.
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    setActivePinia(createPinia())
  })

  it('показывает новые отзывы, переключает фильтр и удаляет после подтверждения на месте', async () => {
    const wrapper = mount(FeedbackReview)
    await flushPromises()
    const review = useReviewStore()

    expect(wrapper.findAll('.feedback-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('цитата')

    review.filter = 'all'
    await flushPromises()
    expect(wrapper.findAll('.feedback-card')).toHaveLength(2)

    const button = (label: string) => wrapper.findAll('button').find((value) => value.text() === label)!
    await button('Удалить').trigger('click')
    expect(wrapper.text()).toContain('Удалить отзыв навсегда?')
    await button('Да, удалить').trigger('click')
    await flushPromises()

    expect(db.remove).toHaveBeenCalledWith('interviewPrep/feedback/fresh')
    expect(wrapper.findAll('.feedback-card')).toHaveLength(1)
  })

  it('«Открыть в редакторе» передаёт уровень и шаг замечания', async () => {
    db.root = { interviewPrep: { feedback: { q: record('new', 1, { step: 'quiz', questionIndex: 4, questionText: 'Что?' }) } } }
    const wrapper = mount(FeedbackReview)
    await flushPromises()

    await wrapper.findAll('button').find((value) => value.text() === 'Открыть в редакторе')!.trigger('click')

    expect(wrapper.emitted('open-editor')?.[0]).toEqual([{ levelId: 'vue-junior', step: 'quiz', questionIndex: 4 }])
  })
})
