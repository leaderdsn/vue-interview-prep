import { describe, expect, it } from 'vitest'

import { floatingPosition, isReportShortcut, selectionQuoteIn } from './selection'

import type { SelectionLike } from './selection'

function article(html: string) {
  const element = document.createElement('article')
  element.innerHTML = html
  document.body.append(element)
  return element
}

function selection(anchor: Node | null, focus: Node | null, text: string, collapsed = false): SelectionLike {
  return { isCollapsed: collapsed, rangeCount: 1, anchorNode: anchor, focusNode: focus, toString: () => text }
}

describe('selectionQuoteIn', () => {
  it('возвращает текст выделения внутри статьи без лишних пробелов', () => {
    const root = article('<p>Первый абзац</p><p>Второй</p>')
    const [first, second] = root.querySelectorAll('p')

    expect(selectionQuoteIn(selection(first!.firstChild, second!.firstChild, ' Первый\n абзац  Второй '), root)).toBe('Первый абзац Второй')
  })

  it('игнорирует пустое, свёрнутое и выходящее за статью выделение', () => {
    const root = article('<p>Текст</p>')
    const outside = document.createElement('p')
    const inside = root.querySelector('p')!.firstChild

    expect(selectionQuoteIn(null, root)).toBeNull()
    expect(selectionQuoteIn(selection(inside, inside, 'Текст', true), root)).toBeNull()
    expect(selectionQuoteIn(selection(inside, inside, '   '), root)).toBeNull()
    expect(selectionQuoteIn(selection(inside, outside, 'Текст и ещё'), root)).toBeNull()
    expect(selectionQuoteIn(selection(inside, inside, 'Текст'), null)).toBeNull()
  })

  it('обрезает длинную цитату до 300 символов', () => {
    const root = article('<p>x</p>')
    const node = root.querySelector('p')!.firstChild

    expect(selectionQuoteIn(selection(node, node, 'a'.repeat(500)), root)).toHaveLength(300)
  })
})

describe('floatingPosition', () => {
  const viewport = { width: 400, height: 800 }
  const size = { width: 200, height: 36 }

  it('ставит кнопку под выделением по его центру', () => {
    expect(floatingPosition({ top: 100, bottom: 120, left: 100, width: 100 }, viewport, size)).toEqual({ top: 128, left: 50 })
  })

  it('не выходит за края окна и поднимается над выделением, если снизу нет места', () => {
    expect(floatingPosition({ top: 100, bottom: 120, left: 0, width: 10 }, viewport, size).left).toBe(8)
    expect(floatingPosition({ top: 100, bottom: 120, left: 390, width: 10 }, viewport, size).left).toBe(192)
    expect(floatingPosition({ top: 760, bottom: 780, left: 100, width: 100 }, viewport, size).top).toBe(716)
  })
})

describe('isReportShortcut', () => {
  const key = (init: Partial<KeyboardEvent>) => ({ key: 'Enter', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init })

  it('срабатывает на Ctrl+Enter и ⌘+Enter, но не на Enter и Ctrl+Shift+Enter', () => {
    expect(isReportShortcut(key({ ctrlKey: true }))).toBe(true)
    expect(isReportShortcut(key({ metaKey: true }))).toBe(true)
    expect(isReportShortcut(key({}))).toBe(false)
    expect(isReportShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isReportShortcut(key({ ctrlKey: true, key: 'a' }))).toBe(false)
  })
})
