/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string
  readonly VITE_API_URL?: string
  readonly VITE_SITE_URL?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_DATABASE_URL?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string
  readonly VITE_GA_PROPERTY_ID?: string
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Версия приложения из package.json, подставляется через `define` в Vite. */
declare const __APP_VERSION__: string

