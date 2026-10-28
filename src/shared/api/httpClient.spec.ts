import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createHttpClient, HttpError } from './httpClient'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('createHttpClient', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  it('собирает URL из базового адреса, пути и параметров', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))
    const client = createHttpClient('https://api.example.com/')

    await client.get('/users', { params: { page: 2, search: undefined } })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/users?page=2',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('отправляет JSON-тело и возвращает разобранный ответ', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }))
    const client = createHttpClient('/api')

    const result = await client.post<{ id: number }>('users', { name: 'Ann' })

    expect(result).toEqual({ id: 1 })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init?.body).toBe('{"name":"Ann"}')
  })

  it('бросает HttpError, когда статус ответа не 2xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, { status: 404, statusText: 'Not Found' }))
    const client = createHttpClient('/api')

    const error = await client.get('missing').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 404, body: { message: 'nope' } })
  })
})
