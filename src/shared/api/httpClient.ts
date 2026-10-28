import { env } from '@/shared/config'

type QueryParams = Record<string, string | number | boolean | undefined>

export type RequestOptions = Omit<RequestInit, 'body' | 'method'> & {
  params?: QueryParams
}

export class HttpError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, statusText: string, body: unknown) {
    super(`HTTP ${status}: ${statusText}`)
    this.name = 'HttpError'
    this.status = status
    this.body = body
  }
}

function buildUrl(baseUrl: string, path: string, params?: QueryParams): string {
  const base = baseUrl.replace(/\/+$/, '')
  const url = `${base}/${path.replace(/^\/+/, '')}`
  if (!params) return url

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `${url}?${query}` : url
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('application/json') ? response.json() : response.text()
}

/** Thin typed wrapper over fetch. Throws `HttpError` for non-2xx responses. */
export function createHttpClient(baseUrl: string) {
  async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    const { params, headers, ...init } = options
    const response = await fetch(buildUrl(baseUrl, path, params), {
      ...init,
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const data = await parseBody(response)
    if (!response.ok) throw new HttpError(response.status, response.statusText, data)
    return data as T
  }

  return {
    get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
    delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
  }
}

export type HttpClient = ReturnType<typeof createHttpClient>

export const httpClient = createHttpClient(env.apiUrl)
