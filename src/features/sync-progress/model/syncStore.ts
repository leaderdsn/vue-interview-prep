import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { isSameProgress, mergeProgress, parseRemoteProgress, useProgressStore } from '@/entities/progress'
import { env } from '@/shared/config'

import { progressPath, SYNC_ENABLED_KEY } from '../config/sync'

import type { SyncStatus } from '../config/sync'
import type { ProgressSnapshot } from '@/entities/progress'
import type * as AuthApi from 'firebase/auth'
import type * as DbApi from 'firebase/database'

export type SyncUser = { name: string; email: string; photoUrl: string | null }

type Sdk = {
  auth: AuthApi.Auth
  db: DbApi.Database
  authApi: typeof AuthApi
  dbApi: typeof DbApi
}

// Closing the popup is a normal way to change one's mind, not an error.
const SILENT_AUTH_ERRORS = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])

function readEnabled(): boolean {
  try {
    return localStorage.getItem(SYNC_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function writeEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(SYNC_ENABLED_KEY, '1')
    else localStorage.removeItem(SYNC_ENABLED_KEY)
  } catch {
    // Without storage the user just signs in again on the next visit.
  }
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
}

/** Google sign-in and live sync of progress through Firebase Realtime Database. */
export const useSyncStore = defineStore('sync', () => {
  const progress = useProgressStore()

  const available = env.firebase !== null
  const user = ref<SyncUser | null>(null)
  const status = ref<SyncStatus>('off')
  const error = ref<string | null>(null)
  const busy = ref(false)

  let sdk: Promise<Sdk> | null = null
  let stopSession: (() => void) | null = null

  function loadSdk(): Promise<Sdk> {
    const config = env.firebase
    if (!config) return Promise.reject(new Error('Firebase не настроен'))
    // SDK modules are split into their own chunk and load only when sync is used.
    sdk ??= Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/database')]).then(
      ([{ getApp, getApps, initializeApp }, authApi, dbApi]) => {
        const app = getApps().length ? getApp() : initializeApp(config)
        const auth = authApi.getAuth(app)
        const loaded: Sdk = { auth, db: dbApi.getDatabase(app), authApi, dbApi }
        authApi.onAuthStateChanged(auth, (account) => {
          stopSession?.()
          stopSession = null
          if (!account) {
            user.value = null
            status.value = 'off'
            return
          }
          user.value = {
            name: account.displayName ?? '',
            email: account.email ?? '',
            photoUrl: account.photoURL,
          }
          stopSession = startSession(loaded, account.uid)
        })
        return loaded
      },
    )
    return sdk
  }

  function fail(cause: unknown) {
    status.value = 'error'
    error.value = cause instanceof Error ? cause.message : 'Не удалось синхронизировать прогресс'
  }

  /**
   * The first snapshot is merged with the local progress, so nothing done before sign-in is lost.
   * After that the database is the source of truth: remote changes replace local ones
   * and local changes are written back.
   */
  function startSession({ db, dbApi }: Sdk, uid: string): () => void {
    const target = dbApi.ref(db, progressPath(uid))
    let lastRemote: ProgressSnapshot | null = null
    let connected = false
    status.value = 'connecting'
    error.value = null

    const push = (value: ProgressSnapshot) => {
      lastRemote = value
      dbApi.set(target, value).catch(fail)
    }

    const offProgress = dbApi.onValue(
      target,
      (snap) => {
        const remote = parseRemoteProgress(snap.val())
        const local = progress.snapshot()
        if (lastRemote === null) {
          const merged = mergeProgress(local, remote)
          if (!isSameProgress(merged, local)) progress.applySnapshot(merged)
          if (!isSameProgress(merged, remote)) push(merged)
          else lastRemote = remote
        } else {
          lastRemote = remote
          if (!isSameProgress(remote, local)) progress.applySnapshot(remote)
        }
        status.value = connected ? 'online' : 'offline'
      },
      fail,
    )

    const offConnected = dbApi.onValue(dbApi.ref(db, '.info/connected'), (snap) => {
      connected = snap.val() === true
      if (lastRemote !== null && status.value !== 'error') status.value = connected ? 'online' : 'offline'
    })

    const stopWatch = watch(
      [() => progress.levels, () => progress.lastVisited],
      () => {
        if (lastRemote === null) return
        const local = progress.snapshot()
        if (!isSameProgress(local, lastRemote)) push(local)
      },
      { deep: true },
    )

    return () => {
      offProgress()
      offConnected()
      stopWatch()
    }
  }

  /** Restores the session of a user who signed in earlier. */
  function init() {
    if (available && readEnabled()) loadSdk().catch(fail)
  }

  async function signIn() {
    busy.value = true
    error.value = null
    try {
      const { auth, authApi } = await loadSdk()
      await authApi.signInWithPopup(auth, new authApi.GoogleAuthProvider())
      writeEnabled(true)
    } catch (cause) {
      if (!SILENT_AUTH_ERRORS.has(errorCode(cause))) fail(cause)
    } finally {
      busy.value = false
    }
  }

  /** Progress stays on this device; it just stops syncing. */
  async function signOut() {
    writeEnabled(false)
    error.value = null
    const { auth, authApi } = await loadSdk()
    await authApi.signOut(auth)
  }

  return { available, user, status, error, busy, init, signIn, signOut }
})
