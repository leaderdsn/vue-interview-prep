/**
 * Очистка HTML тем, пришедшего из базы (правки из админки), по белому списку.
 * Список тегов, атрибутов и классов собран по встроенному контенту (`data/levels`) и стилям `_content.sass`:
 * всё, чего нет в контенте, удаляется. Встроенные темы проходят через очистку без изменений (проверяет тест).
 */

/** Разрешённые теги и их атрибуты. */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  p: [],
  h3: [],
  b: [],
  i: [],
  code: [],
  ul: [],
  ol: [],
  li: [],
  a: ['href', 'target', 'rel'],
  div: ['class', 'aria-hidden'],
  span: ['class'],
  pre: ['class'],
  figure: ['class', 'style'],
  figcaption: [],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ['colspan'],
  td: ['colspan'],
}

/** Классы из `_content.sass`, которые встречаются в контенте. */
const CLASSES = new Set([
  'note',
  'warn',
  'say',
  'eyebrow',
  'code',
  'c',
  'code-label',
  'table-wrap',
  'figure',
  'flow',
  'flow-loop',
  'step',
  'arrow',
  'hl',
  'good',
  'bad',
  'boxes',
  'box',
])

/** Эти элементы удаляются вместе с содержимым; остальные неизвестные теги разворачиваются (текст остаётся). */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'noscript',
  'template',
  'svg',
  'math',
  'img',
  'picture',
  'video',
  'audio',
  'source',
  'canvas',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'link',
  'meta',
  'base',
  'title',
])

/** Проверки значений атрибутов; атрибут с неподходящим значением удаляется. */
const VALUE_CHECKS: Readonly<Record<string, (value: string) => boolean>> = {
  href: isSafeHref,
  target: (value) => value === '_blank' || value === '_self',
  rel: (value) => value.split(/\s+/).every((token) => ['noopener', 'noreferrer', 'nofollow', ''].includes(token)),
  colspan: (value) => /^\d{1,2}$/.test(value),
  'aria-hidden': (value) => value === 'true' || value === 'false',
  // В контенте style встречается только как `margin:0` у <figure>.
  style: (value) => /^\s*margin\s*:\s*0\s*;?\s*$/.test(value),
}

/** Ссылки только http(s), относительные и якоря: никаких javascript:, data: и т. п. */
function isSafeHref(value: string): boolean {
  // Браузер игнорирует пробелы и управляющие символы в схеме («java\nscript:»), поэтому они убираются перед проверкой.
  const compact = value.replace(/[\s\x00-\x1f\x7f]/g, '')
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)
  if (!scheme) return !compact.startsWith('//') && !compact.startsWith('\\')
  return /^https?$/i.test(scheme[1] ?? '')
}

/** Очищает узел на месте; возвращает true, если что-то было удалено или изменено. */
function cleanChildren(parent: Node): boolean {
  let changed = false
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) continue
    if (node.nodeType !== Node.ELEMENT_NODE) {
      // Комментарии, инструкции обработки и прочее не нужны.
      node.parentNode?.removeChild(node)
      changed = true
      continue
    }
    const element = node as Element
    const tag = element.tagName.toLowerCase()
    const allowedAttributes = ALLOWED[tag]

    if (!allowedAttributes) {
      changed = true
      if (DROP_WITH_CONTENT.has(tag)) {
        element.remove()
      } else {
        // Неизвестный тег разворачивается: содержимое очищается и остаётся на его месте.
        cleanChildren(element)
        element.replaceWith(...element.childNodes)
      }
      continue
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (!allowedAttributes.includes(name) || !(VALUE_CHECKS[name]?.(attribute.value) ?? true)) {
        element.removeAttribute(attribute.name)
        changed = true
      } else if (name === 'class') {
        const tokens = attribute.value.split(/\s+/).filter(Boolean)
        // Атрибут переписывается только при недопустимом классе, чтобы не трогать исходное написание.
        if (!tokens.every((token) => CLASSES.has(token))) {
          const kept = tokens.filter((token) => CLASSES.has(token))
          if (kept.length) element.setAttribute('class', kept.join(' '))
          else element.removeAttribute('class')
          changed = true
        }
      }
    }

    if (cleanChildren(element)) changed = true
  }
  return changed
}

/**
 * HTML темы по белому списку. Если удалять нечего, возвращает исходную строку без изменений.
 * Без DOMParser (не браузер) возвращает пустую строку: непроверенный HTML не показывается.
 */
export function sanitizeTopicHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const body = new DOMParser().parseFromString(`<!DOCTYPE html><body>${html}`, 'text/html').body
  return cleanChildren(body) ? body.innerHTML : html
}
