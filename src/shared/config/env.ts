export const env = {
  appTitle: import.meta.env.VITE_APP_TITLE ?? 'Vue Interview Prep',
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
  isDev: import.meta.env.DEV,
} as const
