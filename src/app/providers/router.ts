import { createRouter, createWebHistory } from 'vue-router'

import { findLevel, MAX_TOPICS } from '@/entities/track'
import { QUIZ_STEP, ROUTE_NAMES } from '@/shared/config'

import type { RouteLocationNormalized, RouteLocationRaw, RouteRecordRaw } from 'vue-router'

function notFound(to: RouteLocationNormalized): RouteLocationRaw {
  return { name: ROUTE_NAMES.notFound, params: { pathMatch: to.path.slice(1).split('/') }, replace: true }
}

/**
 * Неизвестный уровень или шаг -> not found; шаг не указан -> первая тема.
 * Номер темы проверяется по `MAX_TOPICS`, а не по индексу: администратор может добавить темы правкой в базе,
 * и их число известно только после загрузки уровня. Темы, которой нет, LevelPage показывает как «Тема не найдена».
 */
export function guardLevel(to: RouteLocationNormalized): boolean | RouteLocationRaw {
  const found = findLevel(String(to.params.levelId))
  if (!found) return notFound(to)

  const step = to.params.step
  if (!step) return { name: ROUTE_NAMES.level, params: { levelId: found.level.id, step: '1' }, replace: true }
  if (step === QUIZ_STEP) return true

  const index = Number(step)
  return Number.isInteger(index) && index >= 1 && index <= MAX_TOPICS ? true : notFound(to)
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: ROUTE_NAMES.home,
    component: () => import('@/pages/home').then((m) => m.HomePage),
  },
  {
    path: '/level/:levelId/:step?',
    name: ROUTE_NAMES.level,
    component: () => import('@/pages/level').then((m) => m.LevelPage),
    props: true,
    beforeEnter: guardLevel,
  },
  {
    path: '/admin',
    name: ROUTE_NAMES.admin,
    component: () => import('@/pages/admin').then((m) => m.AdminPage),
    meta: { title: 'Админка' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: ROUTE_NAMES.notFound,
    component: () => import('@/pages/not-found').then((m) => m.NotFoundPage),
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})
