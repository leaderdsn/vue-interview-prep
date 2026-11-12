import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessionStore } from '@/entities/session'

import { adminPath, useAdminStore } from './adminStore'

import type { QuizQuestion, Topic } from '@/entities/track'
import type * as SharedLib from '@/shared/lib'

/** Маленькая замена части SDK для Realtime Database: дерево в памяти, пути через «/». */
type Tree = Record<string, unknown>
type FakeDb = { root: Tree; denied: Set<string> }
const db = vi.hoisted((): FakeDb => ({ root: {}, denied: new Set() }))

vi.mock('@/shared/lib', async (importOriginal) => {
  const keys = (path: string) => path.split('/').filter(Boolean)
  const read = (path: string): unknown =>
    keys(path).reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Tree)[key] : undefined), db.root)
  const write = (path: string, value: unknown) => {
    const parts = keys(path)
    const last = parts.pop() as string
    let node = db.root
    for (const key of parts) node = (node[key] ??= {}) as Tree
    if (value === null) delete node[last]
    else node[last] = JSON.parse(JSON.stringify(value)) as unknown
  }
  return {
    ...(await importOriginal<typeof SharedLib>()),
    loadFirebase: () =>
      Promise.resolve({
        db: {},
        dbApi: {
          ref: (_db: unknown, path: string) => path,
          get: (path: string) =>
            db.denied.has(path)
              ? Promise.reject(new Error('Permission denied'))
              : Promise.resolve({ val: () => read(path) ?? null }),
          set: (path: string, value: unknown) => Promise.resolve(write(path, value)),
          update: (path: string, values: Tree) =>
            Promise.resolve(Object.entries(values).forEach(([key, value]) => write(`${path}/${key}`, value))),
          remove: (path: string) => Promise.resolve(write(path, null)),
        },
      }),
  }
})

const question: QuizQuestion = {
  topic: 0,
  type: 'theory',
  question: 'Вопрос?',
  code: '',
  options: ['а', 'б', 'в', 'г'],
  answer: 1,
  explanation: 'Так.',
}

const topics: Topic[] = [{ title: 'Тема', html: '<p>Текст</p>' }]

const record = () => (db.root.interviewPrep as Tree | undefined)?.content as Tree | undefined

function signIn(uid: string) {
  useSessionStore().user = { uid, name: 'Админ', email: 'admin@example.com', photoUrl: null, emailVerified: true }
}

describe('useAdminStore', () => {
  beforeEach(() => {
    db.root = {}
    db.denied.clear()
    setActivePinia(createPinia())
  })

  it('пускает аккаунт с флагом администратора в базе', async () => {
    db.root = { interviewPrep: { admins: { u1: true } } }
    const admin = useAdminStore()

    expect(admin.isAdmin).toBeNull()
    signIn('u1')
    await flushPromises()

    expect(admin.isAdmin).toBe(true)
  })

  it('считает ошибку чтения флага отсутствием прав', async () => {
    db.denied.add(adminPath('u2'))
    const admin = useAdminStore()

    signIn('u2')
    await flushPromises()

    expect(admin.isAdmin).toBe(false)
  })

  it('сохраняет тест с автором и датой и удаляет правку', async () => {
    signIn('u1')
    const admin = useAdminStore()

    const saved = await admin.saveQuiz('vue-junior', [question])

    expect(record()?.['vue-junior']).toEqual(saved)
    expect(saved.updatedBy).toBe('admin@example.com')
    expect(saved.quiz?.[0]).not.toHaveProperty('code')
    expect(await admin.loadOverride('vue-junior')).toEqual(saved)

    expect(await admin.resetPart('vue-junior', 'quiz')).toBeNull()
    expect(await admin.loadOverride('vue-junior')).toBeNull()
  })

  it('сохранение тем не затирает тест, и наоборот', async () => {
    signIn('u1')
    const admin = useAdminStore()

    await admin.saveQuiz('vue-junior', [question])
    const saved = await admin.saveTopics('vue-junior', topics)

    expect(saved.topics).toEqual(topics)
    expect(saved.quiz).toHaveLength(1)

    const again = await admin.saveQuiz('vue-junior', [{ ...question, question: 'Другой?' }])

    expect(again.topics).toEqual(topics)
    expect(again.quiz?.[0]?.question).toBe('Другой?')
  })

  it('сброс тем оставляет тест, а сброс последней части удаляет запись', async () => {
    signIn('u1')
    const admin = useAdminStore()
    await admin.saveQuiz('vue-junior', [question])
    await admin.saveTopics('vue-junior', topics)

    const rest = await admin.resetPart('vue-junior', 'topics')

    expect(rest).not.toHaveProperty('topics')
    expect(rest?.quiz).toHaveLength(1)

    await admin.resetPart('vue-junior', 'quiz')

    expect(record()).not.toHaveProperty('vue-junior')
  })

  it('сохраняет темы и тест вместе одной записью', async () => {
    signIn('u1')
    const admin = useAdminStore()
    const three: Topic[] = [...topics, { title: 'Вторая', html: '<p>2</p>' }, { title: 'Третья', html: '<p>3</p>' }]

    const saved = await admin.saveTopicsAndQuiz('vue-junior', three, [{ ...question, topic: 2 }])

    expect(saved.topics).toHaveLength(3)
    expect(saved.quiz?.[0]?.topic).toBe(2)
    expect(saved.updatedBy).toBe('admin@example.com')
  })

  it('сброс всей записи удаляет обе части', async () => {
    signIn('u1')
    const admin = useAdminStore()
    await admin.saveTopicsAndQuiz('vue-junior', topics, [question])

    expect(await admin.resetPart('vue-junior', 'all')).toBeNull()
    expect(record()).not.toHaveProperty('vue-junior')
  })

  it('читает старую запись только с тестом', async () => {
    db.root = { interviewPrep: { content: { 'vue-junior': { quiz: [question], updatedAt: 'd', updatedBy: 'u' } } } }
    const admin = useAdminStore()

    const current = await admin.loadOverride('vue-junior')

    expect(current?.quiz).toHaveLength(1)
    expect(current).not.toHaveProperty('topics')
  })
})
