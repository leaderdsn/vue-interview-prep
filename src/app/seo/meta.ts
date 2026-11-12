// Заголовки, описания и структурированные данные для каждого маршрута.
// Используется роутером в браузере и плагином пререндера при сборке (build/prerender.ts),
// поэтому у файла нет импортов: при сборке он выполняется без алиасов приложения.

export type SeoLevel = {
  id: string
  level: 'junior' | 'middle' | 'senior'
  description: string
  topicTitles: string[]
}

export type SeoTrack = {
  id: string
  title: string
  description: string
  /** Категория главной: vue, react, angular, general. */
  category?: string
  levels: SeoLevel[]
}

export type PageMeta = {
  title: string
  description: string
  /** Путь внутри приложения, начинается с "/" (без base). */
  path: string
  /** Страницы, которые нельзя индексировать: 404, админка. */
  noindex?: boolean
  /** Объекты schema.org, при сборке выводятся как JSON-LD. */
  structuredData?: Record<string, unknown>[]
}

export type SeoContext = {
  appTitle: string
  /** Абсолютный адрес сайта с base, без слэша на конце: https://example.com/app */
  siteUrl: string
}

const LEVEL_LABELS = { junior: 'Junior', middle: 'Middle', senior: 'Senior' } as const

const DESCRIPTION_LIMIT = 160

export const QUIZ_SEGMENT = 'quiz'

export const homePath = () => '/'
export const topicPath = (levelId: string, step: number) => `/level/${levelId}/${step}`
export const quizPath = (levelId: string) => `/level/${levelId}/${QUIZ_SEGMENT}`

/** GitHub Pages отдаёт пререндеренные страницы как папки, поэтому канонические адреса заканчиваются слэшем. */
export function absoluteUrl(ctx: SeoContext, path: string): string {
  return `${ctx.siteUrl}${path.endsWith('/') ? path : `${path}/`}`
}

export function clip(text: string, limit = DESCRIPTION_LIMIT): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, '')}…`
}

/** "Что такое" -> "что такое", а аббревиатуры вроде "JSX" или "OAuth" остаются как есть. */
const lowerFirst = (text: string) =>
  /^\p{Lu}\p{Ll}/u.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text

export function levelName(track: SeoTrack, level: SeoLevel): string {
  return `${track.title} ${LEVEL_LABELS[level.level]}`
}

function breadcrumbs(ctx: SeoContext, items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(ctx, item.path),
    })),
  }
}

export function homeMeta(ctx: SeoContext, tracks: readonly SeoTrack[]): PageMeta {
  const names = tracks.map((track) => track.title).join(', ')
  return {
    title: `${ctx.appTitle} — подготовка к собеседованию фронтенд-разработчика`,
    description: clip(`Темы с примерами кода и тесты по уровням Junior, Middle и Senior: ${names}.`),
    path: homePath(),
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: ctx.appTitle,
        url: absoluteUrl(ctx, homePath()),
        inLanguage: 'ru',
      },
    ],
  }
}

export function topicMeta(ctx: SeoContext, track: SeoTrack, level: SeoLevel, step: number): PageMeta {
  const topic = level.topicTitles[step - 1] ?? ''
  const name = levelName(track, level)
  const path = topicPath(level.id, step)
  return {
    title: `${topic} — ${name} | ${ctx.appTitle}`,
    description: clip(`${topic}. ${name}: ${lowerFirst(level.description)}. Разбор для собеседования и тест по уровню.`),
    path,
    structuredData: [
      breadcrumbs(ctx, [
        { name: ctx.appTitle, path: homePath() },
        { name, path: topicPath(level.id, 1) },
        { name: topic, path },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: topic,
        about: track.title,
        educationalLevel: LEVEL_LABELS[level.level],
        learningResourceType: 'Article',
        inLanguage: 'ru',
        url: absoluteUrl(ctx, path),
        isPartOf: { '@type': 'WebSite', name: ctx.appTitle, url: absoluteUrl(ctx, homePath()) },
      },
    ],
  }
}

export function quizMeta(ctx: SeoContext, track: SeoTrack, level: SeoLevel): PageMeta {
  const name = levelName(track, level)
  const path = quizPath(level.id)
  return {
    title: `Тест: ${name} | ${ctx.appTitle}`,
    description: clip(`Тест по уровню ${name} с объяснениями ответов. Темы: ${level.topicTitles.join('; ')}.`),
    path,
    structuredData: [
      breadcrumbs(ctx, [
        { name: ctx.appTitle, path: homePath() },
        { name, path: topicPath(level.id, 1) },
        { name: 'Тест', path },
      ]),
    ],
  }
}

export function notFoundMeta(ctx: SeoContext, path = '/404'): PageMeta {
  return { title: `Страница не найдена | ${ctx.appTitle}`, description: '', path, noindex: true }
}

/** Страницы вне контента, например админка: свой заголовок, не индексируются. */
export function privateMeta(ctx: SeoContext, title: string, path: string): PageMeta {
  return { title: `${title} | ${ctx.appTitle}`, description: '', path, noindex: true }
}
