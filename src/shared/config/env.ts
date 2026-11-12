export type FirebaseConfig = {
  apiKey: string
  authDomain: string
  databaseURL: string
  projectId: string
  appId: string
  /** Идентификатор потока Google Analytics 4 (G-…); пустой — аналитика выключена. */
  measurementId: string
}

const e = import.meta.env

/** Null, если Firebase не настроен; тогда прогресс остаётся только в этом браузере. */
const firebase: FirebaseConfig | null =
  e.VITE_FIREBASE_API_KEY && e.VITE_FIREBASE_DATABASE_URL
    ? {
        apiKey: e.VITE_FIREBASE_API_KEY,
        authDomain: e.VITE_FIREBASE_AUTH_DOMAIN ?? '',
        databaseURL: e.VITE_FIREBASE_DATABASE_URL,
        projectId: e.VITE_FIREBASE_PROJECT_ID ?? '',
        appId: e.VITE_FIREBASE_APP_ID ?? '',
        measurementId: e.VITE_FIREBASE_MEASUREMENT_ID ?? '',
      }
    : null

export const env = {
  appTitle: e.VITE_APP_TITLE ?? 'Frontend подготовка',
  apiUrl: e.VITE_API_URL ?? '/api',
  /** Публичный адрес сайта с base, без слэша на конце: canonical, sitemap, Open Graph. */
  siteUrl: (e.VITE_SITE_URL ?? 'https://leaderdsn.github.io/vue-interview-prep').replace(/\/+$/, ''),
  isDev: e.DEV,
  firebase,
  /** Отчёты Google Analytics в админке: числовой id ресурса GA4 и OAuth-клиент Google для доступа на чтение. */
  analyticsReport: {
    propertyId: e.VITE_GA_PROPERTY_ID ?? '',
    oauthClientId: e.VITE_GOOGLE_OAUTH_CLIENT_ID ?? '',
  },
} as const
