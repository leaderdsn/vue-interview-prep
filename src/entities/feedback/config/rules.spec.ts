import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import rulesFile from '../../../../database.rules.json'
import { sendFeedback } from '../api/feedbackApi'
import { buildFeedbackRecord } from '../lib/report'

import { FEEDBACK_INTERVAL_MS, FEEDBACK_PATH, feedbackLimitPath } from './feedback'

import type { FeedbackDraft } from '../model/types'
import type * as SharedLib from '@/shared/lib'

/*
 * Маленький симулятор правил Realtime Database: выражения из database.rules.json выполняются как JS
 * с теми же переменными (auth, root, data, newData, now, query, $-переменные пути).
 * Семантика повторяет Firebase в нужном здесь объёме:
 *  - `.write`/`.read` каскадные: доступ даёт первое истинное правило на пути от корня;
 *  - `.validate` проверяется у всех узлов записи, их предков и потомков, кроме удаляемых;
 *  - многопутевой `update` атомарен: отказ по одному пути отменяет всю запись;
 *  - `{ '.sv': 'timestamp' }` превращается во время сервера `now`, общее для всего запроса.
 */

type Json = null | boolean | number | string | { [key: string]: Json }
type Tree = { [key: string]: Json }
type RuleNode = { [key: string]: RuleNode | string | boolean | string[] }
type Auth = { uid: string; token: { firebase: { sign_in_provider: string } } } | null
type Query = { orderByChild?: string; equalTo?: string }

const RULES = (rulesFile as unknown as { rules: RuleNode }).rules

const split = (path: string) => path.split('/').filter(Boolean)

function read(tree: Json, path: string[]): Json {
  let node: Json = tree
  for (const key of path) {
    if (node === null || typeof node !== 'object') return null
    node = node[key] ?? null
  }
  return node
}

function write(tree: Tree, path: string[], value: Json) {
  const keys = [...path]
  const last = keys.pop()!
  let node = tree
  for (const key of keys) {
    const next = node[key]
    node = (next && typeof next === 'object' ? next : (node[key] = {}))
  }
  if (value === null) delete node[last]
  else node[last] = value
}

/** Подставляет время сервера вместо `serverTimestamp()`. */
function resolve(value: unknown, now: number): Json {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object') return value as Json
  const record = value as Record<string, unknown>
  if (record['.sv'] === 'timestamp') return now
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, resolve(item, now)]))
}

class Snapshot {
  constructor(
    private readonly tree: Json,
    private readonly path: string[],
  ) {}

  val(): Json {
    return read(this.tree, this.path)
  }

  exists() {
    return this.val() !== null
  }

  child(path: string) {
    return new Snapshot(this.tree, [...this.path, ...split(path)])
  }

  parent() {
    return new Snapshot(this.tree, this.path.slice(0, -1))
  }

  hasChildren(keys: string[]) {
    const value = this.val()
    return value !== null && typeof value === 'object' && keys.every((key) => key in value)
  }

  isString() {
    return typeof this.val() === 'string'
  }

  isNumber() {
    return typeof this.val() === 'number'
  }
}

type Context = { auth: Auth; now: number; query?: Query; oldTree: Json; newTree: Json }

function evaluate(rule: string | boolean, path: string[], vars: Record<string, string>, ctx: Context): boolean {
  if (typeof rule === 'boolean') return rule
  const names = ['auth', 'root', 'data', 'newData', 'now', 'query', ...Object.keys(vars)]
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- выражения правил выполняются как JS
  const fn = new Function(...names, `return (${rule})`) as (...args: unknown[]) => unknown
  const result = fn(
    ctx.auth,
    new Snapshot(ctx.oldTree, []),
    new Snapshot(ctx.oldTree, path),
    new Snapshot(ctx.newTree, path),
    ctx.now,
    ctx.query ?? {},
    ...Object.values(vars),
  )
  return result === true
}

/** Узлы правил по пути: для каждого уровня — узел (или null) и накопленные $-переменные. */
function ruleChain(path: string[]): { node: RuleNode | null; vars: Record<string, string> }[] {
  const chain: { node: RuleNode | null; vars: Record<string, string> }[] = [{ node: RULES, vars: {} }]
  let node: RuleNode | null = RULES
  let vars: Record<string, string> = {}
  for (const key of path) {
    let next: RuleNode | null = null
    if (node) {
      const literal: RuleNode[string] | undefined = node[key]
      if (literal && typeof literal === 'object' && !Array.isArray(literal)) next = literal
      else {
        const wildcard = Object.keys(node).find((name) => name.startsWith('$'))
        if (wildcard) {
          next = node[wildcard] as RuleNode
          vars = { ...vars, [wildcard]: key }
        }
      }
    }
    node = next
    chain.push({ node, vars })
  }
  return chain
}

function canAccess(kind: '.read' | '.write', path: string[], ctx: Context): boolean {
  return ruleChain(path).some(({ node, vars }, depth) => {
    const rule = node?.[kind]
    return (typeof rule === 'string' || typeof rule === 'boolean') && evaluate(rule, path.slice(0, depth), vars, ctx)
  })
}

function validates(path: string[], ctx: Context): boolean {
  const chain = ruleChain(path)
  // Предки и сам узел.
  for (let depth = 0; depth < chain.length; depth++) {
    const { node, vars } = chain[depth]!
    const rule = node?.['.validate']
    const at = path.slice(0, depth)
    if (rule === undefined || read(ctx.newTree, at) === null) continue
    if (!evaluate(rule as string | boolean, at, vars, ctx)) return false
  }
  // Потомки нового значения.
  const value = read(ctx.newTree, path)
  if (value === null || typeof value !== 'object') return true
  return Object.keys(value).every((key) => validates([...path, key], ctx))
}

function createDb(initial: Tree = {}) {
  let tree: Tree = initial
  let clock = 1_000_000

  return {
    get tree() {
      return tree
    },
    advance(ms: number) {
      clock += ms
    },
    /** Многопутевой update из корня. true — запись принята. */
    update(auth: Auth, values: Record<string, unknown>): boolean {
      clock += 1
      const now = clock
      const oldTree = tree
      const newTree = structuredClone(tree)
      for (const [path, value] of Object.entries(values)) write(newTree, split(path), resolve(value, now))
      const ctx: Context = { auth, now, oldTree, newTree }
      const ok = Object.keys(values).every((path) => canAccess('.write', split(path), ctx) && validates(split(path), ctx))
      if (ok) tree = newTree
      return ok
    },
    read(auth: Auth, path: string, query?: Query): boolean {
      return canAccess('.read', split(path), { auth, now: clock, query, oldTree: tree, newTree: tree })
    },
  }
}

// Строки в правилах сравниваются регулярными выражениями через `.matches()` — как в Firebase.
beforeAll(() => {
  Object.defineProperty(String.prototype, 'matches', {
    configurable: true,
    value(this: string, pattern: RegExp) {
      return pattern.test(this)
    },
  })
})

afterAll(() => {
  delete (String.prototype as { matches?: unknown }).matches
})

const user = (uid: string, provider = 'google.com'): Auth => ({ uid, token: { firebase: { sign_in_provider: provider } } })
const anonymous = (uid: string) => user(uid, 'anonymous')
const TIMESTAMP = { '.sv': 'timestamp' }

const draft: FeedbackDraft = {
  kind: 'typo',
  text: 'Опечатка в слове «компонент»',
  email: '',
  context: { page: '/level/vue-junior/2', levelId: 'vue-junior', step: 2, topicTitle: 'Тема', quote: 'компонетн' },
}

/** То же, что отправляет sendFeedback: запись и отметка частоты одним update. */
function submission(id: string, uid: string, overrides: Record<string, unknown> = {}) {
  return {
    [`${FEEDBACK_PATH}/${id}`]: { ...buildFeedbackRecord(draft, uid, '0.1.0', TIMESTAMP), ...overrides },
    [feedbackLimitPath(uid)]: { at: TIMESTAMP, item: id },
  }
}

const item = (db: ReturnType<typeof createDb>, id: string) => read(db.tree, [...split(FEEDBACK_PATH), id]) as Tree | null

describe('database.rules.json: замечания', () => {
  it('анонимный аккаунт отправляет замечание вместе с отметкой частоты', () => {
    const db = createDb()

    expect(db.update(anonymous('a1'), submission('f1', 'a1'))).toBe(true)
    expect(item(db, 'f1')).toMatchObject({ status: 'new', uid: 'a1', kind: 'typo', quote: 'компонетн' })
    expect(typeof item(db, 'f1')?.createdAt).toBe('number')
  })

  it('без входа писать нельзя', () => {
    expect(createDb().update(null, submission('f1', 'a1'))).toBe(false)
  })

  it('второе замечание раньше чем через 30 секунд отклоняется, позже — принимается', () => {
    const db = createDb()
    db.update(anonymous('a1'), submission('f1', 'a1'))

    db.advance(FEEDBACK_INTERVAL_MS - 1000)
    expect(db.update(anonymous('a1'), submission('f2', 'a1'))).toBe(false)
    expect(item(db, 'f2')).toBeNull()

    db.advance(2000)
    expect(db.update(anonymous('a1'), submission('f2', 'a1'))).toBe(true)
  })

  it('запись без отметки частоты или с отметкой другой записи отклоняется', () => {
    const db = createDb()
    const values = submission('f1', 'a1')

    expect(db.update(anonymous('a1'), { [`${FEEDBACK_PATH}/f1`]: values[`${FEEDBACK_PATH}/f1`] })).toBe(false)
    expect(db.update(anonymous('a1'), { ...values, [feedbackLimitPath('a1')]: { at: TIMESTAMP, item: 'other' } })).toBe(false)
  })

  it('несколько записей одним запросом не проходят', () => {
    const db = createDb()

    expect(db.update(anonymous('a1'), { ...submission('f1', 'a1'), ...submission('f2', 'a1') })).toBe(false)
  })

  it('отметку частоты нельзя подделать, сдвинуть назад или поставить за другого', () => {
    const db = createDb()

    expect(db.update(anonymous('a1'), { [feedbackLimitPath('a1')]: { at: 5, item: 'x' } })).toBe(false)
    expect(db.update(anonymous('a1'), { [feedbackLimitPath('b1')]: { at: TIMESTAMP, item: 'x' } })).toBe(false)
    expect(db.update(anonymous('a1'), { [feedbackLimitPath('a1')]: null })).toBe(false)
  })

  it('проверяет поля: автор, статус, время, длина текста, лишние поля', () => {
    const db = createDb()
    const attempt = (overrides: Record<string, unknown>) => db.update(anonymous('a1'), submission('f1', 'a1', overrides))

    expect(attempt({ uid: 'someone-else' })).toBe(false)
    expect(attempt({ status: 'fixed' })).toBe(false)
    expect(attempt({ createdAt: 123 })).toBe(false)
    expect(attempt({ text: 'abc' })).toBe(false)
    expect(attempt({ text: 'x'.repeat(2001) })).toBe(false)
    expect(attempt({ kind: 'spam' })).toBe(false)
    expect(attempt({ email: 'not-an-email' })).toBe(false)
    expect(attempt({ adminNote: 'сам себе' })).toBe(false)
    expect(attempt({ extra: 1 })).toBe(false)
    expect(attempt({ step: 'quiz', questionIndex: 3, email: 'me@example.com' })).toBe(true)
  })

  it('автор не может переписать или удалить отправленное', () => {
    const db = createDb()
    db.update(anonymous('a1'), submission('f1', 'a1'))
    db.advance(FEEDBACK_INTERVAL_MS + 1)

    expect(db.update(anonymous('a1'), submission('f1', 'a1', { text: 'Новый текст замечания' }))).toBe(false)
    expect(db.update(anonymous('a1'), { [`${FEEDBACK_PATH}/f1/status`]: 'fixed' })).toBe(false)
    expect(db.update(anonymous('a1'), { [`${FEEDBACK_PATH}/f1`]: null })).toBe(false)
  })

  it('администратор меняет статус и заметку, удаляет, но не меняет автора', () => {
    const db = createDb({ interviewPrep: { admins: { boss: true } } })
    db.update(anonymous('a1'), submission('f1', 'a1'))
    const admin = user('boss')

    expect(db.update(admin, { [`${FEEDBACK_PATH}/f1/status`]: 'in_progress', [`${FEEDBACK_PATH}/f1/adminNote`]: 'Посмотрю' })).toBe(true)
    expect(item(db, 'f1')).toMatchObject({ status: 'in_progress', adminNote: 'Посмотрю' })
    expect(db.update(admin, { [`${FEEDBACK_PATH}/f1/status`]: 'whatever' })).toBe(false)
    expect(db.update(admin, { [`${FEEDBACK_PATH}/f1/uid`]: 'boss' })).toBe(false)
    expect(db.update(admin, { [`${FEEDBACK_PATH}/f1`]: null })).toBe(true)
    expect(item(db, 'f1')).toBeNull()
  })

  it('список читает администратор, а автор — только запросом по своему uid и не анонимно', () => {
    const db = createDb({ interviewPrep: { admins: { boss: true } } })

    expect(db.read(user('boss'), FEEDBACK_PATH)).toBe(true)
    expect(db.read(user('u1'), FEEDBACK_PATH, { orderByChild: 'uid', equalTo: 'u1' })).toBe(true)
    expect(db.read(user('u1', 'password'), FEEDBACK_PATH, { orderByChild: 'uid', equalTo: 'u1' })).toBe(true)
    expect(db.read(user('u1'), FEEDBACK_PATH, { orderByChild: 'uid', equalTo: 'u2' })).toBe(false)
    expect(db.read(user('u1'), FEEDBACK_PATH)).toBe(false)
    expect(db.read(anonymous('a1'), FEEDBACK_PATH, { orderByChild: 'uid', equalTo: 'a1' })).toBe(false)
    expect(db.read(null, FEEDBACK_PATH)).toBe(false)
    expect(db.read(user('u1'), feedbackLimitPath('u1'))).toBe(false)
  })

  it('индексы для запросов по автору и дате объявлены', () => {
    const feedback = (RULES.interviewPrep as RuleNode).feedback as RuleNode

    expect(feedback['.indexOn']).toEqual(expect.arrayContaining(['uid', 'createdAt']))
  })
})

// sendFeedback пишет в тот же симулятор: так проверяется, что приложение отправляет то, что примут правила.
const fake = vi.hoisted(() => ({
  update: null as null | ((values: Record<string, unknown>) => boolean),
  ids: 0,
}))

vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedLib>()),
  loadFirebase: () =>
    Promise.resolve({
      db: {},
      dbApi: {
        ref: (_db: unknown, path = '') => path,
        push: () => ({ key: `id${++fake.ids}` }),
        serverTimestamp: () => ({ '.sv': 'timestamp' }),
        update: (_path: string, values: Record<string, unknown>) =>
          fake.update?.(values) ? Promise.resolve() : Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' })),
      },
    }),
}))

describe('sendFeedback и правила базы', () => {
  beforeEach(() => {
    fake.ids = 0
  })

  it('запись приложения проходит правила, а повтор сразу же — нет', async () => {
    const db = createDb()
    fake.update = (values) => db.update(anonymous('a1'), values)

    await expect(sendFeedback(draft, 'a1')).resolves.toBe('id1')
    expect(item(db, 'id1')).toMatchObject({ uid: 'a1', status: 'new', page: '/level/vue-junior/2' })

    await expect(sendFeedback({ ...draft, text: 'Ещё одно замечание' }, 'a1')).rejects.toThrow('PERMISSION_DENIED')
  })
})
