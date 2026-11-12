import { describe, expect, it } from 'vitest'

import { pageLabel } from './analyticsStore'
import { buildRequests, change, normalizePath, parseDaily, parseDashboard, parseRealtime } from './report'

import type { Report } from '../api/ga4'

const row = (dimensions: string[], metrics: number[]) => ({
  dimensionValues: dimensions.map((value) => ({ value })),
  metricValues: metrics.map((value) => ({ value: String(value) })),
})

describe('запросы к GA4', () => {
  it('два пакета не больше чем по пять отчётов, итоги — за текущий и прошлый периоды', () => {
    const [first, second] = buildRequests(28)

    expect(first.length).toBeLessThanOrEqual(5)
    expect(second.length).toBeLessThanOrEqual(5)
    expect(first[0]?.dateRanges).toEqual([
      { startDate: '27daysAgo', endDate: 'today', name: 'current' },
      { startDate: '55daysAgo', endDate: '28daysAgo', name: 'previous' },
    ])
  })
})

describe('разбор отчёта', () => {
  it('нормализует путь: без base, слэша на конце и query', () => {
    expect(normalizePath('/vue-interview-prep/level/vue-junior/2/', '/vue-interview-prep/')).toBe('/level/vue-junior/2')
    expect(normalizePath('/vue-interview-prep/', '/vue-interview-prep/')).toBe('/')
    expect(normalizePath('/level/vue-junior/quiz?x=1')).toBe('/level/vue-junior/quiz')
  })

  it('заполняет нулями дни без визитов', () => {
    const report: Report = { rows: [row(['20261110'], [3, 7, 4])] }

    const daily = parseDaily(report, 7, new Date(2026, 10, 12))

    expect(daily).toHaveLength(7)
    expect(daily[daily.length - 1]).toEqual({ date: '2026-11-12', users: 0, views: 0, sessions: 0 })
    expect(daily.find((day) => day.date === '2026-11-10')).toEqual({ date: '2026-11-10', users: 3, views: 7, sessions: 4 })
  })

  it('собирает панель: итоги по периодам, склеенные страницы, понятные названия', () => {
    const reports: Report[] = [
      { rows: [row(['current'], [10, 6, 14, 40, 0.5, 90]), row(['previous'], [5, 5, 7, 20, 0.4, 60])] },
      { rows: [] },
      {
        rows: [
          row(['/vue-interview-prep/level/vue-junior/1'], [12]),
          row(['/vue-interview-prep/level/vue-junior/1/'], [3]),
          row(['/vue-interview-prep/'], [20]),
        ],
      },
      { rows: [row(['Organic Search'], [6]), row(['Direct'], [8])] },
      { rows: [row(['google'], [5]), row(['yandex'], [1])] },
      { rows: [] },
      { rows: [row(['mobile'], [4])] },
      { rows: [row(['(not set)'], [1])] },
      { rows: [row(['quiz_complete'], [9]), row(['sign_up'], [2])] },
    ]

    const dashboard = parseDashboard(reports, 7, (path) => `«${path}»`, {
      base: '/vue-interview-prep/',
      today: new Date(2026, 10, 12),
    })

    expect(dashboard.current.users).toBe(10)
    expect(dashboard.previous.views).toBe(20)
    expect(dashboard.topPages).toEqual([
      { key: '/', label: '«/»', value: 20 },
      { key: '/level/vue-junior/1', label: '«/level/vue-junior/1»', value: 15 },
    ])
    expect(dashboard.channels.map((item) => item.label)).toEqual(['Поисковые системы', 'Прямые заходы'])
    expect(dashboard.devices[0]?.label).toBe('Телефон')
    expect(dashboard.countries[0]?.label).toBe('Не определено')
    expect(dashboard.events).toEqual({ quizzes: 9, signUps: 2, logins: 0 })
  })

  it('изменение к прошлому периоду', () => {
    expect(change(15, 10)).toBe(50)
    expect(change(5, 10)).toBe(-50)
    expect(change(3, 0)).toBeNull()
  })

  it('называет страницы приложения по-человечески', () => {
    expect(pageLabel('/')).toBe('Главная')
    expect(pageLabel('/level/vue-junior/quiz')).toMatch(/Junior · тест$/)
    expect(pageLabel('/level/vue-junior/1')).toMatch(/Junior · .+/)
    expect(pageLabel('/level/unknown/1')).toBe('/level/unknown/1')
  })
})

describe('реальное время', () => {
  it('считает пользователей и переводит названия событий', () => {
    const realtime = parseRealtime(
      { rows: [row([], [3])] },
      { rows: [row(['Тема — Vue Junior | Сайт'], [2]), row(['(not set)'], [1]), row(['(other)'], [1])] },
      { rows: [row(['page_view'], [5]), row(['custom'], [1])] },
      'Сайт',
    )

    expect(realtime.activeUsers).toBe(3)
    expect(realtime.pages.map((item) => item.label)).toEqual(['Тема — Vue Junior', 'Без заголовка', 'Остальные страницы'])
    expect(realtime.events.map((item) => item.label)).toEqual(['Просмотр страницы', 'custom'])
  })

  it('пустой ответ — ноль пользователей', () => {
    expect(parseRealtime({}, {}, {})).toEqual({ activeUsers: 0, pages: [], events: [] })
  })
})
