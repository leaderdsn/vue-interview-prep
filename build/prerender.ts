import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import {
  absoluteUrl,
  homeMeta,
  levelName,
  notFoundMeta,
  quizMeta,
  quizPath,
  topicMeta,
  topicPath,
} from '../src/app/seo/meta.ts'

import type { PageMeta, SeoContext, SeoTrack } from '../src/app/seo/meta.ts'
import type { Plugin, ResolvedConfig } from 'vite'

type LevelFile = {
  topics: { title: string; html: string }[]
  quiz: { question: string }[]
}

type Page = { meta: PageMeta; body: string }

export type PrerenderOptions = SeoContext & {
  /** Папка с tracks.json, tracks-extra.json и levels/. */
  dataDir: string
}

const LEVEL_LABELS = { junior: 'Junior', middle: 'Middle', senior: 'Senior' } as const

/** Повторяет TRACK_CATEGORIES из entities/track: при сборке алиасы приложения недоступны. */
const CATEGORIES = [
  { id: 'vue', label: 'Vue' },
  { id: 'react', label: 'React' },
  { id: 'angular', label: 'Angular' },
  { id: 'general', label: 'Общее' },
] as const

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** JSON внутри <script> не должен закрывать тег. */
function jsonLd(data: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

function headTags(meta: PageMeta, ctx: SeoContext): string {
  const url = absoluteUrl(ctx, meta.path)
  const tags = [
    `<meta name="robots" content="${meta.noindex ? 'noindex' : 'index, follow'}" />`,
    meta.noindex ? '' : `<link rel="canonical" href="${escapeHtml(url)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeHtml(ctx.appTitle)}" />`,
    '<meta property="og:locale" content="ru_RU" />',
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    '<meta name="twitter:card" content="summary" />',
    ...(meta.structuredData ?? []).map(jsonLd),
  ]
  return tags.filter(Boolean).join('\n    ')
}

/**
 * Вставляет теги <head> и статический контент страницы в собранный index.html.
 * Приложение монтируется через createApp, поэтому при запуске Vue заменяет статический контент, а не гидратирует его.
 */
export function renderPage(template: string, page: Page, ctx: SeoContext): string {
  const { meta } = page
  return template
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(meta.title)}</title>`)
    .replace(
      /<meta name="description"[^>]*>/,
      () => `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    )
    .replace('</head>', () => `  ${headTags(meta, ctx)}\n  </head>`)
    .replace('<div id="app"></div>', () => `<div id="app">${page.body}</div>`)
}

function buildPages(ctx: SeoContext, base: string, tracks: SeoTrack[], levels: Map<string, LevelFile>): Page[] {
  const href = (path: string) => escapeHtml(`${base}${path.slice(1)}${path.endsWith('/') ? '' : '/'}`)
  const pages: Page[] = []

  const home = homeMeta(ctx, tracks)
  const renderTrack = (track: SeoTrack) => {
    const items = track.levels
      .map(
        (level) =>
          `<li><a href="${href(topicPath(level.id, 1))}">${escapeHtml(levelName(track, level))}</a> — ${escapeHtml(level.description)}</li>`,
      )
      .join('')
    return `<section><h3>${escapeHtml(track.title)}</h3><p>${escapeHtml(track.description)}</p><ul>${items}</ul></section>`
  }
  // Направления сгруппированы по категориям, как на главной в приложении.
  const trackList = CATEGORIES.map(({ id, label }) => {
    const inCategory = tracks.filter((track) => (track.category ?? 'general') === id)
    return inCategory.length ? `<section><h2>${label}</h2>${inCategory.map(renderTrack).join('')}</section>` : ''
  }).join('')
  pages.push({
    meta: home,
    body: `<main class="app-main"><h1>${escapeHtml(ctx.appTitle)}</h1><p>${escapeHtml(home.description)}</p>${trackList}</main>`,
  })

  for (const track of tracks) {
    for (const level of track.levels) {
      const content = levels.get(level.id)
      if (!content) throw new Error(`prerender: нет файла уровня ${level.id}`)

      const name = escapeHtml(levelName(track, level))
      const header = `<nav><a href="${href('/')}">Все треки</a></nav><p>${escapeHtml(track.title)} · ${LEVEL_LABELS[level.level]}</p>`
      const steps = (current: number | 'quiz') =>
        `<nav aria-label="Шаги уровня"><ol>${level.topicTitles
          .map((title, index) =>
            index + 1 === current
              ? `<li aria-current="page">${escapeHtml(title)}</li>`
              : `<li><a href="${href(topicPath(level.id, index + 1))}">${escapeHtml(title)}</a></li>`,
          )
          .join('')}${current === 'quiz' ? '<li aria-current="page">Тест</li>' : `<li><a href="${href(quizPath(level.id))}">Тест: ${name}</a></li>`}</ol></nav>`

      content.topics.forEach((topic, index) => {
        const step = index + 1
        pages.push({
          meta: topicMeta(ctx, track, level, step),
          body: `<main class="app-main">${header}<h1>${step}. ${escapeHtml(topic.title)}</h1><article class="content">${topic.html}</article>${steps(step)}</main>`,
        })
      })

      const questions = content.quiz.map((item) => `<li>${escapeHtml(item.question)}</li>`).join('')
      pages.push({
        meta: quizMeta(ctx, track, level),
        body: `<main class="app-main">${header}<h1>Тест: ${name}</h1><ol>${questions}</ol>${steps('quiz')}</main>`,
      })
    }
  }

  return pages
}

export function sitemap(ctx: SeoContext, pages: readonly Page[]): string {
  const urls = pages
    .filter((page) => !page.meta.noindex)
    .map((page) => `  <url><loc>${escapeHtml(absoluteUrl(ctx, page.meta.path))}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T
}

/** Статический HTML для каждой страницы, sitemap.xml, robots.txt и 404.html после `vite build`. */
export function prerender(options: PrerenderOptions): Plugin {
  let config: ResolvedConfig
  const ctx: SeoContext = { appTitle: options.appTitle, siteUrl: options.siteUrl.replace(/\/+$/, '') }

  return {
    name: 'app:prerender',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      const outDir = resolve(config.root, config.build.outDir)
      const template = await readFile(join(outDir, 'index.html'), 'utf-8')

      const tracks = [
        ...(await readJson<SeoTrack[]>(join(options.dataDir, 'tracks.json'))),
        ...(await readJson<SeoTrack[]>(join(options.dataDir, 'tracks-extra.json'))),
      ]
      const levels = new Map<string, LevelFile>()
      for (const level of tracks.flatMap((track) => track.levels)) {
        levels.set(level.id, await readJson<LevelFile>(join(options.dataDir, 'levels', `${level.id}.json`)))
      }

      const pages = buildPages(ctx, config.base, tracks, levels)
      for (const page of pages) {
        const file = join(outDir, page.meta.path, 'index.html')
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, renderPage(template, page, ctx))
      }

      // На неизвестные адреса GitHub Pages отдаёт 404.html, дальше нужную страницу открывает роутер.
      await writeFile(join(outDir, '404.html'), renderPage(template, { meta: notFoundMeta(ctx), body: '' }, ctx))
      await writeFile(join(outDir, 'sitemap.xml'), sitemap(ctx, pages))
      // Поисковики читают robots.txt только в корне домена, поэтому на странице проекта он работает
      // только с собственным доменом; иначе sitemap.xml отправляют в Search Console вручную.
      await writeFile(
        join(outDir, 'robots.txt'),
        `User-agent: *\nDisallow: ${config.base}admin\n\nSitemap: ${absoluteUrl(ctx, '/sitemap.xml').replace(/\/$/, '')}\n`,
      )

      config.logger.info(`prerender: ${pages.length} страниц, sitemap.xml, robots.txt, 404.html`)
    },
  }
}
