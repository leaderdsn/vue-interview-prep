import { defineStore } from 'pinia'
import { ref } from 'vue'

import { isFirebaseConfigured, loadFirebase, trackEvent } from '@/shared/lib'

import { SIGNED_IN_KEY } from '../config/session'

export type SessionUser = {
  uid: string
  name: string
  email: string
  photoUrl: string | null
  /** Почта подтверждена: у Google всегда, у входа по паролю — после перехода по ссылке из письма. */
  emailVerified: boolean
}

type AuthAccount = {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
  emailVerified: boolean
  /** Анонимный аккаунт создаётся только для отправки замечаний (см. ensureUid). */
  isAnonymous?: boolean
}

/**
 * Пользователь для приложения. Анонимный аккаунт входом не считается: его не видят ни шапка,
 * ни синхронизация прогресса, ни проверка прав администратора.
 */
export function toSessionUser(account: AuthAccount | null): SessionUser | null {
  if (!account || account.isAnonymous) return null
  return {
    uid: account.uid,
    name: account.displayName ?? '',
    email: account.email ?? '',
    photoUrl: account.photoURL,
    emailVerified: account.emailVerified,
  }
}

// Закрыть окно входа — нормальный способ передумать, а не ошибка.
const SILENT_AUTH_ERRORS = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])

function readSignedIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1'
  } catch {
    return false
  }
}

function writeSignedIn(value: boolean) {
  try {
    if (value) localStorage.setItem(SIGNED_IN_KEY, '1')
    else localStorage.removeItem(SIGNED_IN_KEY)
  } catch {
    // Без хранилища пользователь просто войдёт заново при следующем визите.
  }
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
}

/** Понятные тексты для частых ошибок Firebase Auth; остальные показываются как есть. */
const AUTH_ERRORS: Readonly<Record<string, string>> = {
  'auth/invalid-credential': 'Неверная почта или пароль',
  'auth/invalid-login-credentials': 'Неверная почта или пароль',
  'auth/wrong-password': 'Неверная почта или пароль',
  'auth/user-not-found': 'Неверная почта или пароль',
  'auth/invalid-email': 'Некорректный адрес почты',
  'auth/missing-email': 'Введите адрес почты',
  'auth/missing-password': 'Введите пароль',
  'auth/weak-password': 'Пароль слишком простой: нужно не меньше 6 символов',
  'auth/email-already-in-use': 'Аккаунт с этой почтой уже есть — войдите или восстановите пароль',
  'auth/too-many-requests': 'Слишком много попыток. Подождите немного и попробуйте снова',
  'auth/user-disabled': 'Аккаунт отключён',
  'auth/network-request-failed': 'Нет соединения с сервером. Проверьте сеть',
  'auth/operation-not-allowed': 'Этот способ входа выключен в настройках Firebase',
  'auth/account-exists-with-different-credential': 'Аккаунт с этой почтой уже есть с другим способом входа',
}

export function authErrorMessage(cause: unknown): string {
  const known = AUTH_ERRORS[errorCode(cause)]
  if (known) return known
  return cause instanceof Error ? cause.message : 'Не удалось войти'
}

/** Вход в Firebase Auth через Google или почту с паролем, общий для синхронизации прогресса и редактора тестов. */
export const useSessionStore = defineStore('session', () => {
  const available = isFirebaseConfigured()
  const user = ref<SessionUser | null>(null)
  const busy = ref(false)
  const error = ref<string | null>(null)

  let listening: Promise<void> | null = null

  function listen(): Promise<void> {
    listening ??= loadFirebase().then(({ auth, authApi }) => {
      authApi.onAuthStateChanged(auth, (account) => {
        user.value = toSessionUser(account)
      })
      // Почту подтверждают в другой вкладке или в почтовом приложении: при возврате на сайт проверяем снова.
      window.addEventListener('focus', () => {
        if (user.value && !user.value.emailVerified) void refreshVerification()
      })
    })
    listening.catch(() => {
      listening = null
    })
    return listening
  }

  function fail(cause: unknown) {
    error.value = authErrorMessage(cause)
  }

  /** Восстанавливает сессию того, кто входил раньше; Firebase загружается только для него. */
  function init() {
    if (available && readSignedIn()) listen().catch(fail)
  }

  /** Общая обёртка входа: флаг занятости, сброс ошибки, запоминание входа. */
  async function attempt(action: (sdk: Awaited<ReturnType<typeof loadFirebase>>) => Promise<unknown>) {
    busy.value = true
    error.value = null
    try {
      await listen()
      await action(await loadFirebase())
      writeSignedIn(true)
      return true
    } catch (cause) {
      if (!SILENT_AUTH_ERRORS.has(errorCode(cause))) fail(cause)
      return false
    } finally {
      busy.value = false
    }
  }

  /** Вход через Google во всплывающем окне. */
  function signIn() {
    return attempt(async ({ auth, authApi }) => {
      const result = await authApi.signInWithPopup(auth, new authApi.GoogleAuthProvider())
      const isNew = authApi.getAdditionalUserInfo(result)?.isNewUser ?? false
      trackEvent(isNew ? 'sign_up' : 'login', { method: 'google' })
    })
  }

  function signInWithEmail(email: string, password: string) {
    return attempt(async ({ auth, authApi }) => {
      await authApi.signInWithEmailAndPassword(auth, email.trim(), password)
      trackEvent('login', { method: 'password' })
    })
  }

  /** Регистрация сразу отправляет письмо со ссылкой для подтверждения почты. */
  function signUpWithEmail(email: string, password: string) {
    return attempt(async ({ auth, authApi }) => {
      const { user: account } = await authApi.createUserWithEmailAndPassword(auth, email.trim(), password)
      await authApi.sendEmailVerification(account)
      trackEvent('sign_up', { method: 'password' })
    })
  }

  /** Повторно отправляет письмо для подтверждения почты. Возвращает true, если письмо отправлено. */
  async function resendVerification() {
    busy.value = true
    error.value = null
    try {
      const { auth, authApi } = await loadFirebase()
      if (!auth.currentUser) return false
      await authApi.sendEmailVerification(auth.currentUser)
      return true
    } catch (cause) {
      fail(cause)
      return false
    } finally {
      busy.value = false
    }
  }

  /**
   * Перечитывает аккаунт после перехода по ссылке из письма.
   * Токен обновляется принудительно: правила базы проверяют email_verified именно в нём.
   */
  async function refreshVerification() {
    try {
      const { auth } = await loadFirebase()
      const account = auth.currentUser
      if (!account) return false
      await account.reload()
      if (account.emailVerified) await account.getIdToken(true)
      if (user.value?.uid === account.uid && user.value.emailVerified !== account.emailVerified) {
        user.value = toSessionUser(account)
      }
      return account.emailVerified
    } catch (cause) {
      fail(cause)
      return false
    }
  }

  /** Письмо со ссылкой для нового пароля. Возвращает true, если письмо отправлено. */
  async function resetPassword(email: string) {
    busy.value = true
    error.value = null
    try {
      const { auth, authApi } = await loadFirebase()
      await authApi.sendPasswordResetEmail(auth, email.trim())
      return true
    } catch (cause) {
      fail(cause)
      return false
    } finally {
      busy.value = false
    }
  }

  /**
   * uid для записи замечания. Если никто не вошёл, входит анонимно: так правила базы ограничивают
   * частоту отправки без сервера. Флаг «входил раньше» не ставится и `user` остаётся пустым, поэтому
   * SDK не грузится на следующих визитах, а вход через Google или почту просто заменит анонимный аккаунт.
   */
  async function ensureUid(): Promise<string> {
    const { auth, authApi } = await loadFirebase()
    // Сохранённый вход (в том числе прежний анонимный) восстанавливается из IndexedDB асинхронно.
    await auth.authStateReady()
    if (auth.currentUser) return auth.currentUser.uid
    const { user: account } = await authApi.signInAnonymously(auth)
    return account.uid
  }

  function clearError() {
    error.value = null
  }

  async function signOut() {
    writeSignedIn(false)
    error.value = null
    const { auth, authApi } = await loadFirebase()
    await authApi.signOut(auth)
  }

  return {
    available,
    user,
    busy,
    error,
    init,
    signIn,
    signInWithEmail,
    signUpWithEmail,
    resendVerification,
    refreshVerification,
    resetPassword,
    ensureUid,
    clearError,
    signOut,
  }
})
