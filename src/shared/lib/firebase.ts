import { env } from '@/shared/config'

import type { FirebaseApp } from 'firebase/app'
import type * as AuthApi from 'firebase/auth'
import type * as DbApi from 'firebase/database'

export type FirebaseSdk = {
  auth: AuthApi.Auth
  db: DbApi.Database
  authApi: typeof AuthApi
  dbApi: typeof DbApi
}

let sdk: Promise<FirebaseSdk> | null = null
let app: Promise<FirebaseApp> | null = null

export function isFirebaseConfigured(): boolean {
  return env.firebase !== null
}

/**
 * SDK Firebase: одно приложение и одно состояние входа для всех, кому они нужны (синхронизация, редактор).
 * Вынесен в отдельный чанк и загружается один раз — только когда кто-то его запросил.
 */
/** Приложение Firebase, общее для входа, базы и аналитики: создаётся один раз, даже при параллельных вызовах. */
export function loadFirebaseApp(): Promise<FirebaseApp> {
  const config = env.firebase
  if (!config) return Promise.reject(new Error('Firebase не настроен'))
  app ??= import('firebase/app').then(({ getApp, getApps, initializeApp }) =>
    getApps().length ? getApp() : initializeApp(config),
  )
  app.catch(() => {
    app = null
  })
  return app
}

export function loadFirebase(): Promise<FirebaseSdk> {
  if (!env.firebase) return Promise.reject(new Error('Firebase не настроен'))
  sdk ??= Promise.all([loadFirebaseApp(), import('firebase/auth'), import('firebase/database')]).then(
    ([firebaseApp, authApi, dbApi]) => ({
      auth: authApi.getAuth(firebaseApp),
      db: dbApi.getDatabase(firebaseApp),
      authApi,
      dbApi,
    }),
  )
  sdk.catch(() => {
    // Чанк мог не загрузиться без сети — следующий вызов попробует снова.
    sdk = null
  })
  return sdk
}

/**
 * Читает публичный путь Realtime Database через REST, чтобы читателям не приходилось скачивать SDK.
 * Null, если Firebase не настроен, путь пуст, запрос завершился ошибкой или не уложился в таймаут.
 */
export async function fetchPublicData(path: string, timeoutMs = 3000): Promise<unknown> {
  const base = env.firebase?.databaseURL
  if (!base) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/${path}.json`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    return response.ok ? ((await response.json()) as unknown) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
