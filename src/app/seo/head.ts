import { absoluteUrl } from './meta'

import type { PageMeta, SeoContext } from './meta'

function upsert(selector: string, create: () => HTMLElement): HTMLElement {
  const found = document.head.querySelector<HTMLElement>(selector)
  if (found) return found
  const element = create()
  document.head.append(element)
  return element
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  const element = upsert(`meta[${attribute}="${key}"]`, () => {
    const meta = document.createElement('meta')
    meta.setAttribute(attribute, key)
    return meta
  })
  element.setAttribute('content', content)
}

/**
 * Приводит <head> в соответствие с текущей страницей после перехода внутри приложения.
 * В пререндеренном HTML те же теги уже есть (build/prerender.ts), поэтому первая загрузка ничего не меняет.
 */
export function applyHead(meta: PageMeta, ctx: SeoContext) {
  const url = absoluteUrl(ctx, meta.path)
  document.title = meta.title
  setMeta('name', 'description', meta.description)
  setMeta('name', 'robots', meta.noindex ? 'noindex' : 'index, follow')
  setMeta('property', 'og:title', meta.title)
  setMeta('property', 'og:description', meta.description)
  setMeta('property', 'og:url', url)
  const canonical = upsert('link[rel="canonical"]', () => {
    const link = document.createElement('link')
    link.rel = 'canonical'
    return link
  })
  canonical.setAttribute('href', url)
}
