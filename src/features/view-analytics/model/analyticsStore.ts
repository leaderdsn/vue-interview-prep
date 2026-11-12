import { defineStore } from 'pinia'
import { ref } from 'vue'

import { findLevel, LEVEL_LABELS } from '@/entities/track'
import { env, QUIZ_STEP } from '@/shared/config'
import { requestGoogleToken } from '@/shared/lib'

import { ANALYTICS_SCOPE, AnalyticsApiError, batchRunReports, runRealtimeReport } from '../api/ga4'

import { buildRequests, parseDashboard, parseRealtime, REALTIME_REQUESTS } from './report'

import type { Dashboard, Period, Realtime } from './report'
import type { GoogleToken } from '@/shared/lib'

/** Понятное название страницы приложения по её пути: «Vue Junior · тема 2». */
export function pageLabel(path: string): string {
  if (path === '/') return 'Главная'
  if (path === '/admin') return 'Редактор'
  const match = /^\/level\/([^/]+)\/([^/]+)$/.exec(path)
  const found = match ? findLevel(match[1] ?? '') : null
  if (!match || !found) return path
  const name = `${found.track.title} ${LEVEL_LABELS[found.level.level]}`
  if (match[2] === QUIZ_STEP) return `${name} · тест`
  const title = found.level.topicTitles[Number(match[2]) - 1]
  return title ? `${name} · ${title}` : path
}

/** Отчёты Google Analytics в админке. Токен доступа живёт только в памяти вкладки. */
export const useAnalyticsStore = defineStore('analytics-report', () => {
  const { propertyId, oauthClientId } = env.analyticsReport
  const configured = Boolean(propertyId && oauthClientId)

  const token = ref<GoogleToken | null>(null)
  const period = ref<Period>(28)
  const dashboard = ref<Dashboard | null>(null)
  const realtime = ref<Realtime | null>(null)
  const realtimeAt = ref<Date | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let request = 0

  async function connect() {
    error.value = null
    try {
      token.value = await requestGoogleToken(oauthClientId, ANALYTICS_SCOPE)
      await Promise.all([load(), loadRealtime()])
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Не удалось подключить Google Analytics'
    }
  }

  async function load() {
    const current = token.value
    if (!current) return
    if (current.expiresAt <= Date.now()) {
      token.value = null
      error.value = 'Доступ к Google Analytics истёк. Подключитесь заново'
      return
    }
    const id = ++request
    const days = period.value
    loading.value = true
    error.value = null
    try {
      const batches = buildRequests(days)
      const reports = (
        await Promise.all(batches.map((batch) => batchRunReports(propertyId, current.accessToken, batch)))
      ).flat()
      if (id !== request) return
      dashboard.value = parseDashboard(reports, days, pageLabel, { base: import.meta.env.BASE_URL })
    } catch (cause) {
      if (id !== request) return
      if (cause instanceof AnalyticsApiError && cause.status === 401) token.value = null
      error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить отчёт'
    } finally {
      if (id === request) loading.value = false
    }
  }

  /** Последние 30 минут; ошибки не мешают основному отчёту и показываются им же при обновлении. */
  async function loadRealtime() {
    const current = token.value
    if (!current || current.expiresAt <= Date.now()) return
    try {
      const [total, pages, events] = await Promise.all(
        [REALTIME_REQUESTS.total, REALTIME_REQUESTS.pages, REALTIME_REQUESTS.events].map((body) =>
          runRealtimeReport(propertyId, current.accessToken, body),
        ),
      )
      realtime.value = parseRealtime(total, pages, events, env.appTitle)
      realtimeAt.value = new Date()
    } catch (cause) {
      if (cause instanceof AnalyticsApiError && cause.status === 401) token.value = null
    }
  }

  function refresh() {
    return Promise.all([load(), loadRealtime()])
  }

  function setPeriod(next: Period) {
    period.value = next
    void load()
  }

  function disconnect() {
    token.value = null
    dashboard.value = null
    realtime.value = null
    realtimeAt.value = null
    error.value = null
  }

  return {
    configured,
    propertyId,
    token,
    period,
    dashboard,
    realtime,
    realtimeAt,
    loading,
    error,
    connect,
    load,
    loadRealtime,
    refresh,
    setPeriod,
    disconnect,
  }
})
