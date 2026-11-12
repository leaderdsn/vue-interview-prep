/**
 * Блочная модель HTML темы для редактора: `parseBlocks` раскладывает HTML на блоки верхнего уровня,
 * `serializeBlocks` собирает обратно.
 *
 * Без правок сборка даёт ровно исходную строку: каждый блок хранит свой исходный HTML (`source`)
 * и пробелы перед и после себя (`before`, `after`), а HTML генерируется заново только у изменённых блоков
 * (редактор удаляет у них `source`). Блоки, которые нельзя отредактировать формой без потерь
 * (лишние атрибуты, вложенная разметка в коде, объединённые ячейки таблиц, схемы), становятся блоком «HTML».
 */

export type BlockType = 'heading' | 'paragraph' | 'list' | 'code' | 'note' | 'warn' | 'say' | 'table' | 'html'

type BlockBase = {
  /** Ключ для v-for, не сохраняется. */
  id: string
  /** Пробелы перед блоком и после него в исходном HTML (в контенте — перевод строки между блоками). */
  before: string
  after: string
  /** Исходный HTML блока; пока он есть, блок сохраняется как был. Удаляется при правке. */
  source?: string
}

/** Блоки, у которых форма правит один HTML: строчный (абзац, заметка…) или сырой (блок «HTML»). */
type HtmlBlockType = 'heading' | 'paragraph' | 'note' | 'warn' | 'say' | 'html'
type HtmlFields = { [T in HtmlBlockType]: { type: T; html: string } }[HtmlBlockType]

export type Block = BlockBase &
  (
    | HtmlFields
    | { type: 'list'; ordered: boolean; items: string[] }
    | { type: 'code'; label: string; code: string }
    | { type: 'table'; head: string[]; rows: string[][] }
  )

/** Блок без служебных полей: то, что правит форма. */
export type BlockFields = DistributiveOmit<Block, keyof BlockBase>

/** Omit для каждого варианта объединения отдельно (обычный Omit склеивает варианты). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export const BLOCK_LABELS: Readonly<Record<BlockType, string>> = {
  heading: 'Подзаголовок',
  paragraph: 'Абзац',
  list: 'Список',
  code: 'Код',
  note: 'Заметка',
  warn: 'Ловушка',
  say: 'Как сказать на собеседовании',
  table: 'Таблица',
  html: 'HTML',
}

/** Подпись блока «как сказать», она не редактируется. */
export const SAY_EYEBROW = 'Как сказать на собеседовании'

let lastId = 0
const nextId = () => `block-${++lastId}`

/** Новый пустой блок; между блоками в контенте — перевод строки. */
export function createBlock(type: BlockType): Block {
  const base = { id: nextId(), before: '\n', after: '' }
  switch (type) {
    case 'list':
      return { ...base, type, ordered: false, items: [''] }
    case 'code':
      return { ...base, type, label: '', code: '' }
    case 'table':
      return { ...base, type, head: ['', ''], rows: [['', '']] }
    default:
      return { ...base, type, html: '' }
  }
}

/** Копия блока с новым ключом (исходный HTML сохраняется); вставляется после оригинала, поэтому отделена переводом строки. */
export function duplicateBlock(block: Block): Block {
  return { ...(JSON.parse(JSON.stringify(block)) as Block), id: nextId(), before: '\n', after: '' }
}

/**
 * Перемещает блок. Пробелы между блоками относятся к позициям, а не к блокам: так перемещение
 * не склеивает блоки и не переносит перевод строки из конца темы в середину.
 */
export function moveBlock(blocks: readonly Block[], from: number, to: number): Block[] {
  if (from < 0 || from >= blocks.length || to < 0 || to >= blocks.length || from === to) return [...blocks]
  const moved = [...blocks]
  const [block] = moved.splice(from, 1)
  moved.splice(to, 0, block as Block)
  return moved.map((item, index) => {
    const slot = blocks[index] as Block
    return item.before === slot.before && item.after === slot.after ? item : { ...item, before: slot.before, after: slot.after }
  })
}

/** Поля форм всех типов блоков; форма меняет только поля своего типа. */
export type BlockFieldValues = Partial<{
  html: string
  ordered: boolean
  items: string[]
  label: string
  code: string
  head: string[]
  rows: string[][]
}>

/** Блок с новыми полями; исходный HTML отбрасывается, и при сохранении HTML собирается из полей. */
export function patchBlock<B extends Block>(block: B, fields: BlockFieldValues): B {
  const result = { ...block, ...fields } as B
  delete result.source
  return result
}

// ---------- Генерация HTML ----------

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const comment = (text: string) => `<span class="c">${escapeHtml(text)}</span>`

/**
 * Начало однострочного комментария: `//` или `#` в начале строки или после пробела (поэтому `://` в адресах
 * не считается). После `#` должен идти пробел, `#`, `!` или конец строки — так `#private`, цвета `#fff`
 * и `<template #slot>` остаются кодом, а `# комментарий`, `## заголовок` и `#!/bin/sh` выделяются.
 */
const COMMENT_START = /(^|\s)(\/\/|#(?=[\s#!]|$))/

/** Код как HTML для `<pre class="code">`: текст экранируется, однострочные комментарии оборачиваются в `span.c`. */
export function highlightCode(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      const match = COMMENT_START.exec(line)
      if (!match) return escapeHtml(line)
      const start = match.index + (match[1] ?? '').length
      return escapeHtml(line.slice(0, start)) + comment(line.slice(start))
    })
    .join('\n')
}

/** HTML блока, собранный из полей формы. */
export function renderBlock(block: Block): string {
  switch (block.type) {
    case 'heading':
      return `<h3>${block.html}</h3>`
    case 'paragraph':
      return `<p>${block.html}</p>`
    case 'note':
      return `<div class="note">${block.html}</div>`
    case 'warn':
      return `<div class="note warn">${block.html}</div>`
    case 'say':
      return `<div class="say"><span class="eyebrow">${SAY_EYEBROW}</span>${block.html}</div>`
    case 'html':
      return block.html
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul'
      return `<${tag}>${block.items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`
    }
    case 'code': {
      const label = block.label.trim() ? `<div class="code-label">${escapeHtml(block.label.trim())}</div>` : ''
      // Парсер HTML съедает первый перевод строки после <pre>, поэтому ведущий перевод строки удваивается.
      const code = block.code.startsWith('\n') ? `\n${block.code}` : block.code
      return `${label}<pre class="code">${highlightCode(code)}</pre>`
    }
    case 'table': {
      const head = block.head.map((cell) => `<th>${cell}</th>`).join('')
      const rows = block.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
      return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
    }
  }
}

/** HTML блока: исходный, если блок не правили, иначе собранный из полей. */
export function serializeBlock(block: Block): string {
  return block.source ?? renderBlock(block)
}

export function serializeBlocks(blocks: readonly Block[]): string {
  return blocks.map((block) => block.before + serializeBlock(block) + block.after).join('')
}

// ---------- Разбор HTML ----------

/** Фрагмент HTML верхнего уровня: исходный текст и соответствующий ему узел DOM. */
type Segment = { source: string; node: ChildNode }

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript'])

function parseBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<!DOCTYPE html><body>${html}`, 'text/html').body
}

/** Конец тега, начинающегося с `<` на позиции `start` (с учётом кавычек в атрибутах), или -1. */
function tagEnd(html: string, start: number): number {
  let quote = ''
  for (let i = start + 1; i < html.length; i++) {
    const char = html[i]
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return i
    }
  }
  return -1
}

/**
 * Делит исходную строку на куски верхнего уровня (элементы, текст, комментарии), не меняя ни символа.
 * Простой счётчик вложенности тегов; результат потом сверяется с настоящим разбором DOM.
 */
function splitTopLevel(html: string): string[] | null {
  const parts: string[] = []
  let depth = 0
  let start = 0
  let i = 0

  const closeTopLevel = (end: number) => {
    if (depth === 0) {
      parts.push(html.slice(start, end))
      start = end
    }
  }

  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4)
      if (end < 0) return null
      if (depth === 0 && i > start) parts.push(html.slice(start, i))
      if (depth === 0) start = i
      i = end + 3
      closeTopLevel(i)
      continue
    }

    const opening = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(i, i + 40))
    const closing = /^<\/([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(i, i + 40))
    if (!opening && !closing) {
      i++
      continue
    }

    const end = tagEnd(html, i)
    if (end < 0) return null
    // Текст верхнего уровня перед тегом — отдельный кусок.
    if (depth === 0 && i > start) {
      parts.push(html.slice(start, i))
      start = i
    }

    if (closing) {
      depth--
      if (depth < 0) return null
      i = end + 1
      closeTopLevel(i)
      continue
    }

    const name = (opening?.[1] ?? '').toLowerCase()
    i = end + 1
    if (VOID_TAGS.has(name) || html[end - 1] === '/') {
      closeTopLevel(i)
      continue
    }
    depth++
    if (RAW_TEXT_TAGS.has(name)) {
      // Внутри script/style и т. п. символ `<` не начинает тег.
      const close = html.toLowerCase().indexOf(`</${name}`, i)
      if (close < 0) return null
      i = close
    }
  }

  if (depth !== 0) return null
  if (start < html.length) parts.push(html.slice(start))
  return parts
}

function serializeNode(node: ChildNode): string {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).outerHTML
  if (node.nodeType === Node.COMMENT_NODE) return `<!--${(node as Comment).data}-->`
  return escapeHtml((node as Text).data).replace(/ /g, '&nbsp;')
}

/**
 * Куски верхнего уровня с узлами DOM. Исходные строки берутся из `splitTopLevel`, если разбор каждого куска
 * совпадает с разбором всего HTML; иначе (кривой HTML) — сериализация DOM, то есть нормализованный HTML.
 */
function segments(html: string): Segment[] {
  const nodes = [...parseBody(html).childNodes]
  const parts = splitTopLevel(html)
  const exact =
    parts !== null &&
    parts.length === nodes.length &&
    parts.every((part, index) => {
      const node = nodes[index]
      return node !== undefined && parseBody(part).innerHTML === serializeNode(node)
    })
  return nodes.map((node, index) => ({ node, source: exact ? (parts[index] ?? '') : serializeNode(node) }))
}

const isBlank = (node: ChildNode) => node.nodeType === Node.TEXT_NODE && !(node as Text).data.trim()

/** Элемент с указанным тегом и ровно такими атрибутами (класс сравнивается строкой). */
function isPlain(node: ChildNode | null | undefined, tag: string, className?: string): boolean {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false
  const element = node as HTMLElement
  if (element.tagName.toLowerCase() !== tag) return false
  if (className === undefined) return element.attributes.length === 0
  return element.attributes.length === 1 && element.getAttribute('class') === className
}

/** Элемент содержит только текст (без вложенных тегов). */
const hasOnlyText = (element: Element) => [...element.childNodes].every((child) => child.nodeType === Node.TEXT_NODE)

/** Дочерние элементы, если кроме них есть только пробелы; иначе null. */
function elementChildren(element: Element): HTMLElement[] | null {
  const children = [...element.childNodes]
  if (!children.every((child) => child.nodeType === Node.ELEMENT_NODE || isBlank(child))) return null
  return children.filter((child): child is HTMLElement => child.nodeType === Node.ELEMENT_NODE)
}

/** Текст кода, если `<pre class="code">` содержит только текст и `span.c` с текстом. */
function codeText(element: HTMLElement): string | null {
  if (!isPlain(element, 'pre', 'code')) return null
  const simple = [...element.childNodes].every(
    (child) => child.nodeType === Node.TEXT_NODE || (isPlain(child, 'span', 'c') && hasOnlyText(child as Element)),
  )
  return simple ? (element.textContent ?? '') : null
}

function parseTable(element: HTMLElement): { head: string[]; rows: string[][] } | null {
  const [table, ...rest] = elementChildren(element) ?? []
  if (!table || rest.length || !isPlain(table, 'table')) return null
  const sections = elementChildren(table)
  const [thead, tbody] = sections ?? []
  if (!thead || !tbody || sections?.length !== 2 || !isPlain(thead, 'thead') || !isPlain(tbody, 'tbody')) return null

  const cells = (row: HTMLElement, tag: string) => {
    const list = elementChildren(row)
    return list?.every((cell) => isPlain(cell, tag)) ? list.map((cell) => cell.innerHTML) : null
  }
  const headRows = elementChildren(thead)
  const bodyRows = elementChildren(tbody)
  if (headRows?.length !== 1 || !bodyRows || !headRows.concat(bodyRows).every((row) => isPlain(row, 'tr'))) return null

  const head = cells(headRows[0] as HTMLElement, 'th')
  const rows = bodyRows.map((row) => cells(row, 'td'))
  if (!head?.length || !rows.every((row): row is string[] => row !== null && row.length === head.length)) return null
  return { head, rows }
}

/** Поля блока по элементу верхнего уровня; null — блок «HTML». */
function recognize(node: ChildNode): BlockFields | null {
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const element = node as HTMLElement

  if (isPlain(element, 'h3')) return { type: 'heading', html: element.innerHTML }
  if (isPlain(element, 'p')) return { type: 'paragraph', html: element.innerHTML }
  if (isPlain(element, 'div', 'note')) return { type: 'note', html: element.innerHTML }
  if (isPlain(element, 'div', 'note warn')) return { type: 'warn', html: element.innerHTML }

  if (isPlain(element, 'ul') || isPlain(element, 'ol')) {
    const items = elementChildren(element)
    if (!items?.length || !items.every((item) => isPlain(item, 'li'))) return null
    return { type: 'list', ordered: element.tagName === 'OL', items: items.map((item) => item.innerHTML) }
  }

  if (isPlain(element, 'div', 'say')) {
    const [eyebrow, ...rest] = [...element.childNodes]
    if (!eyebrow || !isPlain(eyebrow, 'span', 'eyebrow') || !hasOnlyText(eyebrow as Element)) return null
    if (eyebrow.textContent !== SAY_EYEBROW) return null
    return { type: 'say', html: rest.map(serializeNode).join('') }
  }

  if (isPlain(element, 'div', 'table-wrap')) {
    const table = parseTable(element)
    return table && { type: 'table', ...table }
  }

  const code = codeText(element)
  return code === null ? null : { type: 'code', label: '', code }
}

/** Блоки темы. Повторная сборка `serializeBlocks` без правок возвращает исходную строку. */
export function parseBlocks(html: string): Block[] {
  const blocks: Block[] = []
  let gap = ''
  const list = segments(html)

  for (let index = 0; index < list.length; index++) {
    const { node, source } = list[index] as Segment
    if (isBlank(node)) {
      gap += source
      continue
    }

    // Подпись файла и следующий за ней код — один блок «Код».
    const next = list[index + 1]
    const afterNext = list[index + 2]
    if (isPlain(node, 'div', 'code-label') && hasOnlyText(node as Element)) {
      const between = next && isBlank(next.node) ? next : null
      const pre = between ? afterNext : next
      const code = pre && pre.node.nodeType === Node.ELEMENT_NODE ? codeText(pre.node as HTMLElement) : null
      if (pre && code !== null) {
        blocks.push({
          id: nextId(),
          before: gap,
          after: '',
          source: source + (between?.source ?? '') + pre.source,
          type: 'code',
          label: node.textContent ?? '',
          code,
        })
        gap = ''
        index += between ? 2 : 1
        continue
      }
    }

    const fields = recognize(node) ?? { type: 'html', html: source }
    blocks.push({ id: nextId(), before: gap, after: '', source, ...fields })
    gap = ''
  }

  // Пробелы в конце темы принадлежат последнему блоку.
  const last = blocks[blocks.length - 1]
  if (last) last.after = gap
  return blocks
}
