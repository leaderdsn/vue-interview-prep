import { env } from '@/shared/config'

import { loadFirebaseApp } from './firebase'

/** Параметры события GA4: только простые значения. */
export type AnalyticsParams = Record<string, string | number | boolean>

type Sender = (name: string, params: AnalyticsParams) => void

let sender: Promise<Sender | null> | null = null
let lastPage: AnalyticsParams | null = null

export function isAnalyticsConfigured(): boolean {
  return Boolean(env.firebase?.measurementId)
}

/**
 * Подключает Google Analytics 4 через Firebase Analytics. Вызывается только после согласия посетителя:
 * до этого SDK не загружается и cookies не ставятся. Просмотры страниц отправляются вручную (trackPageView),
 * поэтому автоматический page_view выключен.
 */
export function enableAnalytics(): Promise<boolean> {
  if (!isAnalyticsConfigured()) return Promise.resolve(false)
  sender ??= Promise.all([loadFirebaseApp(), import('firebase/analytics')])
    .then(async ([app, api]) => {
      if (!(await api.isSupported())) return null
      const analytics = api.initializeAnalytics(app, { config: { send_page_view: false } })
      // На локальном сервере события помечаются как отладочные: они видны в GA → Admin → DebugView.
      const debug: AnalyticsParams = env.isDev ? { debug_mode: true } : {}
      return (name: string, params: AnalyticsParams) => api.logEvent(analytics, name, { ...params, ...debug })
    })
    .catch(() => {
      // Блокировщик рекламы или нет сети: статистика просто не собирается.
      sender = null
      return null
    })
  return sender.then((send) => {
    // Страница, открытая до согласия, тоже засчитывается.
    if (send && lastPage) send('page_view', lastPage)
    return send !== null
  })
}

/** Событие GA4. До согласия (или без настроек) ничего не делает. */
export function trackEvent(name: string, params: AnalyticsParams = {}) {
  void sender?.then((send) => send?.(name, params))
}

/** Просмотр текущей страницы: GA4 берёт путь из page_location, поэтому вызывать после смены адреса. */
export function trackPageView(title: string) {
  lastPage = { page_title: title, page_location: location.href }
  trackEvent('page_view', lastPage)
}
