import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { isSameProgress, mergeProgress, parseRemoteProgress, useProgressStore } from '@/entities/progress'
import { useSessionStore } from '@/entities/session'
import { loadFirebase } from '@/shared/lib'

import { progressPath } from '../config/sync'

import type { SyncStatus } from '../config/sync'
import type { ProgressSnapshot } from '@/entities/progress'
import type { SessionUser } from '@/entities/session'
import type { FirebaseSdk } from '@/shared/lib'

export type SyncUser = SessionUser

/**
 * Синхронизация прогресса в реальном времени через Firebase Realtime Database для вошедшего аккаунта Google.
 * Сам вход живёт в сущности session, поэтому редактор и синхронизация делят одно приложение Firebase и аккаунт.
 */
export const useSyncStore = defineStore('sync', () => {
  const progress = useProgressStore()
  const session = useSessionStore()

  const available = session.available
  const user = computed(() => session.user)
  const busy = computed(() => session.busy)
  const status = ref<SyncStatus>('off')
  const syncError = ref<string | null>(null)
  const error = computed(() => syncError.value ?? session.error)

  let stopSession: (() => void) | null = null

  function fail(cause: unknown) {
    status.value = 'error'
    syncError.value = cause instanceof Error ? cause.message : 'Не удалось синхронизировать прогресс'
  }

  /**
   * Первый снимок объединяется с локальным прогрессом, чтобы не потерять сделанное до входа.
   * Дальше источник правды — база: удалённые изменения заменяют локальные,
   * а локальные записываются обратно.
   */
  function startSession({ db, dbApi }: FirebaseSdk, uid: string): () => void {
    const target = dbApi.ref(db, progressPath(uid))
    let lastRemote: ProgressSnapshot | null = null
    let connected = false
    status.value = 'connecting'
    syncError.value = null

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

  // Кто бы ни вошёл (здесь или в редакторе), его прогресс синхронизируется; выход это останавливает.
  // Без подтверждённой почты прогресс в аккаунт не пишется: он остаётся только на устройстве.
  watch(
    () => [session.user?.uid ?? null, session.user?.emailVerified ?? false] as const,
    ([uid, verified]) => {
      stopSession?.()
      stopSession = null
      syncError.value = null
      if (!uid) {
        status.value = 'off'
        return
      }
      if (!verified) {
        status.value = 'unverified'
        return
      }
      loadFirebase()
        .then((sdk) => {
          if (session.user?.uid === uid && !stopSession) stopSession = startSession(sdk, uid)
        })
        .catch(fail)
    },
    { immediate: true },
  )

  /** Восстанавливает сессию пользователя, который входил раньше. */
  function init() {
    session.init()
  }

  async function signIn() {
    syncError.value = null
    await session.signIn()
    if (session.error && !session.user) status.value = 'error'
  }

  /** Прогресс остаётся на устройстве, просто перестаёт синхронизироваться. */
  async function signOut() {
    syncError.value = null
    await session.signOut()
  }

  return { available, user, status, error, busy, init, signIn, signOut }
})
