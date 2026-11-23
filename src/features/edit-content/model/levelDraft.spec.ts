import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

import { useSessionStore } from '@/entities/session'
import { applyOverride } from '@/entities/track'

import { useLevelDraft } from './levelDraft'
import { DELETED_TOPIC } from './structure'

import type { Level, LevelOverride, QuizQuestion } from '@/entities/track'
import type * as SharedLib from '@/shared/lib'

/** База в памяти: запись правки уровня и число вызовов update (темы и тест должны уходить одним запросом). */
const db = vi.hoisted(() => ({ record: null as Record<string, unknown> | null, updates: 0 }))

vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedLib>()),
  loadFirebase: () =>
    Promise.resolve({
      db: {},
      dbApi: {
        ref: (_db: unknown, path: string) => path,
        get: () => Promise.resolve({ val: () => db.record }),
        update: (_path: string, values: Record<string, unknown>) => {
          db.updates += 1
          // Как в Realtime Database: null удаляет поле.
          const next: Record<string, unknown> = { ...db.record, ...(JSON.parse(JSON.stringify(values)) as Record<string, unknown>) }
          for (const key of Object.keys(next)) if (next[key] === null) delete next[key]
          db.record = next
          return Promise.resolve()
        },
        remove: (path: string) => {
          const part = /\/(quiz|topics)$/.exec(path)?.[1]
          if (part && db.record) {
            const rest = { ...db.record }
            delete rest[part]
            db.record = rest
          } else {
            db.record = null
          }
          return Promise.resolve()
        },
      },
    }),
}))

const question = (topic: number, text = `Вопрос к теме ${topic + 1}?`): QuizQuestion => ({
  topic,
  type: 'theory',
  question: text,
  options: ['а', 'б', 'в', 'г'],
  answer: 0,
  explanation: 'Так.',
})

const level: Level = {
  id: 'vue-junior',
  trackId: 'vue',
  level: 'junior',
  topics: [
    { title: 'Первая', html: '<p>Один</p>' },
    { title: 'Вторая', html: '<p>Два</p>' },
  ],
  quizVariants: [[question(0), question(1)]],
}

/** Правка реактивна, как проп ContentEditor: родитель подменяет её после сохранения. */
function setup(initial: LevelOverride | null = null) {
  const override = shallowRef(initial)
  const changed = vi.fn((next: LevelOverride | null) => (override.value = next))
  const draft = useLevelDraft(level, () => override.value, changed)
  return { draft, changed, current: () => override.value }
}

describe('черновик уровня: сохранение', () => {
  beforeEach(() => {
    db.record = null
    db.updates = 0
    setActivePinia(createPinia())
    useSessionStore().user = { uid: 'u1', name: 'Админ', email: 'admin@example.com', photoUrl: null, emailVerified: true }
  })

  it('правка только заголовка сохраняет только темы', async () => {
    const { draft } = setup()
    draft.updateTopic(0, { title: 'Первая, исправленная' })

    expect(draft.structureChanged).toBe(false)

    await draft.saveTopics()

    expect(db.updates).toBe(1)
    expect(db.record).toHaveProperty('topics')
    expect(db.record).not.toHaveProperty('quizVariants')
    expect(draft.topicsDirty).toBe(false)
  })

  it('новая тема сохраняется вместе с тестом одним update, и пользователи видят обе части', async () => {
    const { draft, changed, current } = setup()
    draft.addTopic()
    draft.updateTopic(2, { title: 'Третья', blocks: [{ ...draft.topics[2]!.blocks[0]!, html: 'Три' } as never] })
    draft.setQuiz([...draft.quiz, question(2, 'К третьей?')])

    expect(draft.topicsSaveIssues).toEqual([])

    await draft.saveTopics()

    expect(db.updates).toBe(1)
    expect(changed).toHaveBeenCalledTimes(1)
    const shown = applyOverride(level, current())
    expect(shown.topics.map((topic) => topic.title)).toEqual(['Первая', 'Вторая', 'Третья'])
    expect(shown.quizVariants[0]?.map((item) => item.topic)).toEqual([0, 1, 2])
    expect(draft.dirty).toBe(false)
    expect(draft.structureChanged).toBe(false)
  })

  it('перестановка тем сохраняет тест с пересчитанными темами и из редактора теста', async () => {
    const { draft, current } = setup()
    draft.moveTopicBy(0, 1)

    expect(draft.quizDirty).toBe(true)

    await draft.saveQuiz()

    expect(db.updates).toBe(1)
    const shown = applyOverride(level, current())
    expect(shown.topics.map((topic) => topic.title)).toEqual(['Вторая', 'Первая'])
    // Вопрос «к теме 1» по-прежнему про «Первую», которая теперь вторая.
    expect(shown.quizVariants[0]?.map((item) => [item.question, item.topic])).toEqual([
      ['Вопрос к теме 1?', 1],
      ['Вопрос к теме 2?', 0],
    ])
  })

  it('после удаления темы нельзя сохранить, пока вопросу не выбрана другая тема', async () => {
    const { draft } = setup()
    draft.deleteTopic(0)

    expect(draft.quiz[0]?.topic).toBe(DELETED_TOPIC)
    expect(draft.quizSaveIssues).toEqual(['Вопрос 1: тема удалена — выберите другую'])
    expect(draft.topicsSaveIssues).toEqual(['Тест. Вопрос 1: тема удалена — выберите другую'])

    draft.setQuiz(draft.quiz.map((item) => ({ ...item, topic: 0 })))

    expect(draft.topicsSaveIssues).toEqual([])
    await draft.saveTopics()
    expect(db.record).toMatchObject({ topics: [{ title: 'Вторая' }], quizVariants: [[{ topic: 0 }, { topic: 0 }]] })
  })

  it('последнюю тему удалить нельзя', () => {
    const { draft } = setup()
    draft.deleteTopic(0)
    draft.deleteTopic(0)

    expect(draft.topics).toHaveLength(1)
  })

  it('сброс тем с другим числом тем удаляет и тест, ссылающийся на них', async () => {
    const topics = [...level.topics, { title: 'Третья', html: '<p>Три</p>' }]
    db.record = { topics, quizVariants: [[question(2)]], updatedAt: '', updatedBy: '' }
    const { draft, current } = setup(db.record as LevelOverride)

    expect(draft.topics).toHaveLength(3)
    expect(draft.resetTopicsResetsQuiz).toBe(true)

    await draft.resetTopics()

    expect(db.record).toBeNull()
    expect(current()).toBeNull()
    expect(draft.topics).toHaveLength(2)
    expect(draft.variants).toEqual(level.quizVariants)
  })

  it('сброс теста при темах, к которым не подходит тест из сборки, удаляет и темы', async () => {
    db.record = { topics: [level.topics[0]], quizVariants: [[question(0)]], updatedAt: '', updatedBy: '' }
    const { draft } = setup(db.record as LevelOverride)

    expect(draft.topics).toHaveLength(1)
    expect(draft.resetQuizResetsTopics).toBe(true)

    await draft.resetQuiz()

    expect(db.record).toBeNull()
    expect(draft.topics).toHaveLength(2)
  })

  it('сброс теста при подходящем тесте из сборки оставляет темы', async () => {
    const topics = [...level.topics, { title: 'Третья', html: '<p>Три</p>' }]
    db.record = { topics, quizVariants: [[question(2)]], updatedAt: '', updatedBy: '' }
    const { draft } = setup(db.record as LevelOverride)

    expect(draft.resetQuizResetsTopics).toBe(false)

    await draft.resetQuiz()

    expect(db.record).toHaveProperty('topics')
    expect(db.record).not.toHaveProperty('quizVariants')
    expect(draft.topics).toHaveLength(3)
    expect(draft.variants).toEqual(level.quizVariants)
  })
})

describe('черновик уровня: варианты теста', () => {
  beforeEach(() => {
    db.record = null
    db.updates = 0
    setActivePinia(createPinia())
    useSessionStore().user = { uid: 'u1', name: 'Админ', email: 'admin@example.com', photoUrl: null, emailVerified: true }
  })

  it('новый вариант — заготовка по темам первого; пока он пустой, сохранить нельзя', () => {
    const { draft } = setup()

    expect(draft.addVariant()).toBe(1)
    expect(draft.variant).toBe(1)
    expect(draft.quiz.map((item) => item.topic)).toEqual([0, 1])
    expect(draft.quizDirty).toBe(true)
    expect(draft.quizSaveIssues[0]).toMatch(/^Вариант 2\. Вопрос 1: /)
  })

  it('заполненный вариант сохраняется вместе с первым, и пользователи видят оба', async () => {
    const { draft, current } = setup()
    draft.addVariant()
    draft.setQuiz([question(0, 'Другой к первой?'), question(1, 'Другой ко второй?')])

    expect(draft.quizSaveIssues).toEqual([])
    await draft.saveQuiz()

    expect(applyOverride(level, current()).quizVariants.map((quiz) => quiz.map((item) => item.question))).toEqual([
      ['Вопрос к теме 1?', 'Вопрос к теме 2?'],
      ['Другой к первой?', 'Другой ко второй?'],
    ])
    expect(draft.quizDirty).toBe(false)
  })

  it('удаление темы переписывает вопросы во всех вариантах', () => {
    const { draft } = setup()
    draft.addVariant()
    draft.deleteTopic(0)

    expect(draft.variants.map((quiz) => quiz.map((item) => item.topic))).toEqual([
      [DELETED_TOPIC, 0],
      [DELETED_TOPIC, 0],
    ])
  })

  it('удаление варианта и отмена изменений', () => {
    const { draft } = setup()
    draft.addVariant()
    draft.removeVariant(1)

    expect(draft.variants).toHaveLength(1)
    expect(draft.variant).toBe(0)
    draft.removeVariant(0)
    expect(draft.variants).toHaveLength(1)

    draft.addVariant()
    draft.discardQuiz()
    expect(draft.variants).toEqual(level.quizVariants)
    expect(draft.variant).toBe(0)
  })
})
