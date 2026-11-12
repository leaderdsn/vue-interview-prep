/**
 * OAuth-токен Google для браузера через Google Identity Services (без своего сервера).
 * Токен живёт около часа и хранится только в памяти вкладки.
 */

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string }

type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void }

type GoogleOAuth2 = {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type: string; message?: string }) => void
  }) => TokenClient
}

declare global {
  // Расширить глобальный Window можно только через interface.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'

let script: Promise<GoogleOAuth2> | null = null

function loadGis(): Promise<GoogleOAuth2> {
  script ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const ready = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else reject(new Error('Google Identity Services не загрузился'))
    }
    if (window.google?.accounts?.oauth2) return ready()
    const element = document.createElement('script')
    element.src = GIS_SRC
    element.async = true
    element.onload = ready
    element.onerror = () => reject(new Error('Не удалось загрузить скрипт входа Google. Проверьте сеть и блокировщики'))
    document.head.append(element)
  })
  script.catch(() => {
    script = null
  })
  return script
}

export type GoogleToken = { accessToken: string; expiresAt: number }

/** Открывает окно Google и возвращает токен с запрошенным доступом. Должен вызываться по клику пользователя. */
export async function requestGoogleToken(clientId: string, scope: string): Promise<GoogleToken> {
  const oauth2 = await loadGis()
  return new Promise<GoogleToken>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (response.access_token) {
          resolve({ accessToken: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 })
        } else {
          reject(new Error(response.error_description ?? response.error ?? 'Google не выдал доступ'))
        }
      },
      error_callback: (error) =>
        reject(new Error(error.type === 'popup_closed' ? 'Окно входа закрыто' : (error.message ?? error.type))),
    })
    client.requestAccessToken()
  })
}
