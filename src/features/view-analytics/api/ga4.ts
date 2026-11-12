/**
 * Минимальный клиент Google Analytics Data API v1beta: только то, что нужно отчёту в админке.
 * https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/batchRunReports
 */

const API = 'https://analyticsdata.googleapis.com/v1beta'

/** Доступ только на чтение отчётов GA. */
export const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

export type DateRange = { startDate: string; endDate: string; name?: string }

type StringFilter = { fieldName: string; stringFilter?: { value: string }; inListFilter?: { values: string[] } }

export type ReportRequest = {
  dateRanges: DateRange[]
  dimensions?: { name: string }[]
  metrics: { name: string }[]
  dimensionFilter?: { filter: StringFilter }
  orderBys?: ({ dimension: { dimensionName: string } } | { metric: { metricName: string }; desc?: boolean })[]
  limit?: number
  keepEmptyRows?: boolean
}

export type ReportRow = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }

export type Report = {
  dimensionHeaders?: { name: string }[]
  metricHeaders?: { name: string }[]
  rows?: ReportRow[]
}

type ApiError = { error?: { code?: number; message?: string; status?: string } }

export class AnalyticsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AnalyticsApiError'
  }
}

function explain(status: number, apiStatus: string | undefined, message: string): string {
  if (status === 401) return 'Доступ к Google Analytics истёк. Подключитесь заново'
  if (status === 403 && apiStatus === 'PERMISSION_DENIED' && /not been used|disabled/i.test(message)) {
    return 'В Google Cloud не включён Google Analytics Data API (см. README, раздел «Статистика»)'
  }
  if (status === 403) return 'У этого аккаунта Google нет доступа к ресурсу Google Analytics'
  return message || `Ошибка Google Analytics (${status})`
}

/** До 5 отчётов за один запрос. */
export async function batchRunReports(
  propertyId: string,
  accessToken: string,
  requests: ReportRequest[],
): Promise<Report[]> {
  const response = await fetch(`${API}/properties/${encodeURIComponent(propertyId)}:batchRunReports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  const body = (await response.json().catch(() => ({}))) as { reports?: Report[] } & ApiError
  if (!response.ok) {
    throw new AnalyticsApiError(
      explain(response.status, body.error?.status, body.error?.message ?? ''),
      response.status,
    )
  }
  return body.reports ?? []
}

export type RealtimeRequest = {
  dimensions?: { name: string }[]
  metrics: { name: string }[]
  orderBys?: ReportRequest['orderBys']
  limit?: number
}

/**
 * Отчёт за последние 30 минут. Обычные отчёты GA обрабатывает с задержкой до суток,
 * а этот показывает визиты сразу — им удобно проверять, что сбор работает.
 */
export async function runRealtimeReport(
  propertyId: string,
  accessToken: string,
  request: RealtimeRequest,
): Promise<Report> {
  const response = await fetch(`${API}/properties/${encodeURIComponent(propertyId)}:runRealtimeReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const body = (await response.json().catch(() => ({}))) as Report & ApiError
  if (!response.ok) {
    throw new AnalyticsApiError(
      explain(response.status, body.error?.status, body.error?.message ?? ''),
      response.status,
    )
  }
  return body
}
