export type FirebaseConfig = {
  apiKey: string
  authDomain: string
  databaseURL: string
  projectId: string
  appId: string
}

const e = import.meta.env

/** Null when Firebase is not configured; progress then stays in this browser only. */
const firebase: FirebaseConfig | null =
  e.VITE_FIREBASE_API_KEY && e.VITE_FIREBASE_DATABASE_URL
    ? {
        apiKey: e.VITE_FIREBASE_API_KEY,
        authDomain: e.VITE_FIREBASE_AUTH_DOMAIN ?? '',
        databaseURL: e.VITE_FIREBASE_DATABASE_URL,
        projectId: e.VITE_FIREBASE_PROJECT_ID ?? '',
        appId: e.VITE_FIREBASE_APP_ID ?? '',
      }
    : null

export const env = {
  appTitle: e.VITE_APP_TITLE ?? 'Vue Interview Prep',
  apiUrl: e.VITE_API_URL ?? '/api',
  isDev: e.DEV,
  firebase,
} as const
