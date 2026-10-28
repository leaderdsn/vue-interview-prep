export const ROUTE_NAMES = {
  home: 'home',
  level: 'level',
  notFound: 'not-found',
} as const

export type RouteName = (typeof ROUTE_NAMES)[keyof typeof ROUTE_NAMES]

export const QUIZ_STEP = 'quiz'
