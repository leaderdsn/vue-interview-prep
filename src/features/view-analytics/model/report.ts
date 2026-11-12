import type { RealtimeRequest, Report, ReportRequest } from '../api/ga4'

export const PERIODS = [7, 28, 90] as const
export type Period = (typeof PERIODS)[number]

export type Totals = {
  users: number
  newUsers: number
  sessions: number
  views: number
  /** Доля вовлечённых сессий, 0..1. */
  engagementRate: number
  /** Средняя длительность сессии в секундах. */
  sessionSeconds: number
}

export type DayPoint = { date: string; users: number; views: number; sessions: number }

export type Item = { key: string; label: string; value: number }

export type Dashboard = {
  current: Totals
  previous: Totals
  daily: DayPoint[]
  topPages: Item[]
  channels: Item[]
  searchEngines: Item[]
  searchLandingPages: Item[]
  devices: Item[]
  countries: Item[]
  events: { quizzes: number; signUps: number; logins: number }
}

const TOTAL_METRICS = ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate', 'averageSessionDuration']

const ORGANIC = { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: 'Organic Search' } } }

const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  'Organic Search': 'Поисковые системы',
  Direct: 'Прямые заходы',
  Referral: 'Переходы с сайтов',
  'Organic Social': 'Соцсети',
  'Organic Video': 'Видео',
  'Paid Search': 'Реклама в поиске',
  Email: 'Почта',
  Unassigned: 'Не определено',
}

const DEVICE_LABELS: Readonly<Record<string, string>> = {
  desktop: 'Компьютер',
  mobile: 'Телефон',
  tablet: 'Планшет',
}

/** GA4 принимает относительные даты: «NdaysAgo» и «today». */
function ranges(days: Period) {
  return [
    { startDate: `${days - 1}daysAgo`, endDate: 'today', name: 'current' },
    { startDate: `${days * 2 - 1}daysAgo`, endDate: `${days}daysAgo`, name: 'previous' },
  ]
}

function top(dimension: string, metric: string, days: Period, limit: number, extra: Partial<ReportRequest> = {}) {
  return {
    dateRanges: ranges(days).slice(0, 1),
    dimensions: [{ name: dimension }],
    metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }],
    limit,
    ...extra,
  } satisfies ReportRequest
}

/** Два пакета по пять отчётов: Data API принимает не больше пяти за запрос. */
export function buildRequests(days: Period): [ReportRequest[], ReportRequest[]] {
  return [
    [
      { dateRanges: ranges(days), metrics: TOTAL_METRICS.map((name) => ({ name })) },
      {
        dateRanges: ranges(days).slice(0, 1),
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 400,
      },
      top('pagePath', 'screenPageViews', days, 10),
      top('sessionDefaultChannelGroup', 'sessions', days, 10),
      top('sessionSource', 'sessions', days, 8, { dimensionFilter: ORGANIC }),
    ],
    [
      top('landingPage', 'sessions', days, 10, { dimensionFilter: ORGANIC }),
      top('deviceCategory', 'activeUsers', days, 5),
      top('country', 'activeUsers', days, 8),
      top('eventName', 'eventCount', days, 10, {
        dimensionFilter: {
          filter: { fieldName: 'eventName', inListFilter: { values: ['quiz_complete', 'sign_up', 'login'] } },
        },
      }),
    ],
  ]
}

const num = (value: string | undefined) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const EMPTY_TOTALS: Totals = { users: 0, newUsers: 0, sessions: 0, views: 0, engagementRate: 0, sessionSeconds: 0 }

function parseTotals(report: Report | undefined): { current: Totals; previous: Totals } {
  const result = { current: { ...EMPTY_TOTALS }, previous: { ...EMPTY_TOTALS } }
  for (const row of report?.rows ?? []) {
    // При нескольких периодах GA добавляет измерение dateRange с именем периода.
    const range = row.dimensionValues?.[row.dimensionValues.length - 1]?.value === 'previous' ? 'previous' : 'current'
    const [users, newUsers, sessions, views, engagementRate, sessionSeconds] = (row.metricValues ?? []).map((m) =>
      num(m.value),
    )
    result[range] = {
      users: users ?? 0,
      newUsers: newUsers ?? 0,
      sessions: sessions ?? 0,
      views: views ?? 0,
      engagementRate: engagementRate ?? 0,
      sessionSeconds: sessionSeconds ?? 0,
    }
  }
  return result
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

/** Дни без визитов GA не возвращает — заполняем их нулями, чтобы на графике не было разрывов. */
export function parseDaily(report: Report | undefined, days: Period, today = new Date()): DayPoint[] {
  const byDate = new Map<string, DayPoint>()
  for (const row of report?.rows ?? []) {
    const raw = row.dimensionValues?.[0]?.value ?? ''
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    const [users, views, sessions] = (row.metricValues ?? []).map((m) => num(m.value))
    byDate.set(date, { date, users: users ?? 0, views: views ?? 0, sessions: sessions ?? 0 })
  }
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(end)
    day.setUTCDate(end.getUTCDate() - (days - 1 - index))
    const date = isoDate(day)
    return byDate.get(date) ?? { date, users: 0, views: 0, sessions: 0 }
  })
}

function parseItems(report: Report | undefined, label: (key: string) => string = (key) => key): Item[] {
  return (report?.rows ?? []).map((row) => {
    const key = row.dimensionValues?.[0]?.value ?? ''
    return { key, label: label(key), value: num(row.metricValues?.[0]?.value) }
  })
}

/**
 * Путь внутри приложения: без base и слэша на конце, без query.
 * «/vue-interview-prep/level/vue-junior/2/» и «/level/vue-junior/2» — одна страница.
 */
export function normalizePath(path: string, base = '/'): string {
  let clean = path.split('?')[0] ?? ''
  const prefix = base.replace(/\/+$/, '')
  if (prefix && (clean === prefix || clean.startsWith(`${prefix}/`))) clean = clean.slice(prefix.length)
  clean = clean.replace(/\/+$/, '')
  return clean === '' ? '/' : clean
}

/** Склеивает строки с одинаковым путём после нормализации. */
function mergePaths(items: Item[], label: (path: string) => string, base: string): Item[] {
  const merged = new Map<string, Item>()
  for (const item of items) {
    const key = normalizePath(item.key, base)
    const existing = merged.get(key)
    if (existing) existing.value += item.value
    else merged.set(key, { key, label: label(key), value: item.value })
  }
  return [...merged.values()].sort((a, b) => b.value - a.value)
}

export function parseDashboard(
  reports: Report[],
  days: Period,
  pageLabel: (path: string) => string,
  { base = '/', today = new Date() }: { base?: string; today?: Date } = {},
): Dashboard {
  const [totals, daily, pages, channels, engines, landing, devices, countries, events] = reports
  const eventCounts = new Map(parseItems(events).map((item) => [item.key, item.value]))
  return {
    ...parseTotals(totals),
    daily: parseDaily(daily, days, today),
    topPages: mergePaths(parseItems(pages), pageLabel, base),
    channels: parseItems(channels, (key) => CHANNEL_LABELS[key] ?? key),
    searchEngines: parseItems(engines),
    searchLandingPages: mergePaths(parseItems(landing), pageLabel, base),
    devices: parseItems(devices, (key) => DEVICE_LABELS[key] ?? key),
    countries: parseItems(countries, (key) => (key === '(not set)' ? 'Не определено' : key)),
    events: {
      quizzes: eventCounts.get('quiz_complete') ?? 0,
      signUps: eventCounts.get('sign_up') ?? 0,
      logins: eventCounts.get('login') ?? 0,
    },
  }
}

/** Изменение к прошлому периоду в процентах; null, если сравнивать не с чем. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export type Realtime = { activeUsers: number; pages: Item[]; events: Item[] }

export const REALTIME_REQUESTS = {
  total: { metrics: [{ name: 'activeUsers' }] },
  pages: {
    dimensions: [{ name: 'unifiedScreenName' }],
    metrics: [{ name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    limit: 10,
  },
  events: {
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 10,
  },
} satisfies Record<string, RealtimeRequest>

const EVENT_LABELS: Readonly<Record<string, string>> = {
  page_view: 'Просмотр страницы',
  quiz_complete: 'Пройден тест',
  sign_up: 'Регистрация',
  login: 'Вход',
  first_visit: 'Первый визит',
  session_start: 'Начало сессии',
  user_engagement: 'Активность на странице',
}

/** Заголовок вкладки без названия сайта: «Тема — Vue Junior | Сайт» → «Тема — Vue Junior». */
function screenLabel(key: string, siteTitle: string): string {
  if (key === '(not set)') return 'Без заголовка'
  // Строки, не вошедшие в лимит отчёта, GA собирает в «(other)».
  if (key === '(other)') return 'Остальные страницы'
  const suffix = ` | ${siteTitle}`
  return siteTitle && key.endsWith(suffix) ? key.slice(0, -suffix.length) : key
}

export function parseRealtime(
  total: Report | undefined,
  pages: Report | undefined,
  events: Report | undefined,
  siteTitle = '',
): Realtime {
  return {
    activeUsers: num(total?.rows?.[0]?.metricValues?.[0]?.value),
    pages: parseItems(pages, (key) => screenLabel(key, siteTitle)),
    events: parseItems(events, (key) => EVENT_LABELS[key] ?? key),
  }
}
