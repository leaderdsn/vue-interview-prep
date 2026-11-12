import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { TRACKS } from '@/entities/track'

import { applyHead } from './head'
import { routeMeta } from './index'
import { absoluteUrl, clip, homeMeta, quizMeta, topicMeta } from './meta'

import type { SeoContext } from './meta'
import type { RouteLocationNormalized } from 'vue-router'

const ctx: SeoContext = { appTitle: 'Подготовка', siteUrl: 'https://example.com/app' }
const track = TRACKS[0]!
const level = track.levels[0]!

describe('meta', () => {
  it('канонический адрес с базой и слэшем на конце, как у папок на GitHub Pages', () => {
    expect(absoluteUrl(ctx, '/')).toBe('https://example.com/app/')
    expect(absoluteUrl(ctx, '/level/vue-junior/1')).toBe('https://example.com/app/level/vue-junior/1/')
    expect(absoluteUrl(ctx, '/level/vue-junior/1/')).toBe('https://example.com/app/level/vue-junior/1/')
  })

  it('обрезает описание по слову и ставит многоточие', () => {
    const text = 'слово '.repeat(60)
    const result = clip(text, 50)
    expect(result.length).toBeLessThanOrEqual(50)
    expect(result.endsWith('слово…')).toBe(true)
    expect(clip('  коротко  ')).toBe('коротко')
  })

  it('у темы свой заголовок, описание и хлебные крошки', () => {
    const meta = topicMeta(ctx, track, level, 2)
    expect(meta.title).toBe(`${level.topicTitles[1]} — ${track.title} Junior | Подготовка`)
    expect(meta.path).toBe(`/level/${level.id}/2`)
    expect(meta.description.length).toBeLessThanOrEqual(160)
    expect(meta.noindex).toBeUndefined()
    expect(meta.structuredData?.map((item) => item['@type'])).toEqual(['BreadcrumbList', 'LearningResource'])
  })

  it('главная и тест индексируются', () => {
    expect(homeMeta(ctx, TRACKS).path).toBe('/')
    expect(quizMeta(ctx, track, level)).toMatchObject({ path: `/level/${level.id}/quiz`, title: expect.stringContaining('Тест') })
  })
})

describe('routeMeta', () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: {} },
      { path: '/level/:levelId/:step?', name: 'level', component: {} },
      { path: '/admin', name: 'admin', component: {}, meta: { title: 'Редактор' } },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: {} },
    ],
  })

  it.each([
    ['/', false, 'подготовка к собеседованию'],
    [`/level/${level.id}/1`, false, level.topicTitles[0]!],
    [`/level/${level.id}/quiz`, false, 'Тест:'],
    // Тема сверх индекса (добавлена правкой из базы) не попадает в поиск.
    [`/level/${level.id}/${level.topicTitles.length + 1}`, true, `Тема ${level.topicTitles.length + 1}`],
    ['/admin', true, 'Редактор'],
    ['/missing', true, 'Страница не найдена'],
  ])('%s', (path, noindex, title) => {
    // resolve() возвращает те же поля, что роутер передаёт в afterEach
    const meta = routeMeta(router.resolve(path) as unknown as RouteLocationNormalized)
    expect(Boolean(meta.noindex)).toBe(noindex)
    expect(meta.title).toContain(title)
  })
})

describe('applyHead', () => {
  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('обновляет title, description, canonical и Open Graph без дублей', () => {
    applyHead(topicMeta(ctx, track, level, 1), ctx)
    applyHead(topicMeta(ctx, track, level, 2), ctx)

    expect(document.title).toContain(level.topicTitles[1])
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `https://example.com/app/level/${level.id}/2/`,
    )
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(document.title)
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow')
  })
})
