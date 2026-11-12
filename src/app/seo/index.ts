import { findLevel, TRACKS } from '@/entities/track'
import { env, QUIZ_STEP, ROUTE_NAMES } from '@/shared/config'
import { trackPageView } from '@/shared/lib'

import { applyHead } from './head'
import { homeMeta, levelName, notFoundMeta, privateMeta, quizMeta, topicMeta } from './meta'

import type { PageMeta, SeoContext } from './meta'
import type { RouteLocationNormalized, Router } from 'vue-router'

const ctx: SeoContext = { appTitle: env.appTitle, siteUrl: env.siteUrl }

declare module 'vue-router' {
  // Расширение модуля работает только через interface.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface RouteMeta {
    /** Заголовок служебной страницы вне контента (не индексируется), например админки. */
    title?: string
  }
}

export function routeMeta(route: Pick<RouteLocationNormalized, 'name' | 'params' | 'path' | 'meta'>): PageMeta {
  if (route.name === ROUTE_NAMES.home) return homeMeta(ctx, TRACKS)
  if (route.name === ROUTE_NAMES.level) {
    const found = findLevel(String(route.params.levelId))
    if (found) {
      const step = String(route.params.step)
      if (step === QUIZ_STEP) return quizMeta(ctx, found.track, found.level)
      const index = Number(step)
      // Темы, которой нет в индексе (добавлена правкой из базы или не существует), нет в пререндере и sitemap — не индексируем.
      if (index > found.level.topicTitles.length) {
        return privateMeta(ctx, `Тема ${index} — ${levelName(found.track, found.level)}`, route.path)
      }
      return topicMeta(ctx, found.track, found.level, index)
    }
  }
  if (route.name === ROUTE_NAMES.notFound) return notFoundMeta(ctx, route.path)
  return privateMeta(ctx, route.meta.title ?? env.appTitle, route.path)
}

/** Title, description, canonical и Open Graph для каждой страницы. */
export function installSeo(router: Router) {
  router.afterEach((to, _from, failure) => {
    if (failure) return
    const meta = routeMeta(to)
    applyHead(meta, ctx)
    // Служебные страницы (админка) в статистику не попадают.
    if (to.name !== ROUTE_NAMES.admin) trackPageView(meta.title)
  })
}
