import { normalizeQuote } from '@/entities/feedback'

/** Часть Selection, которая нужна для цитаты (удобно подменять в тестах). */
export type SelectionLike = Pick<Selection, 'isCollapsed' | 'rangeCount' | 'anchorNode' | 'focusNode' | 'toString'>

export type Rect = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>

export type Size = { width: number; height: number }

/** Примерный размер плавающей кнопки: позиция считается до её отрисовки. */
export const FLOATING_BUTTON_SIZE: Size = { width: 210, height: 36 }

const GAP = 8
const MARGIN = 8

/**
 * Цитата из выделения, если оно целиком внутри `container` (статьи темы); иначе null.
 * Пробелы схлопываются, длина ограничена 300 символами.
 */
export function selectionQuoteIn(selection: SelectionLike | null, container: Node | null): string | null {
  if (!selection || !container || selection.isCollapsed || selection.rangeCount === 0) return null
  const { anchorNode, focusNode } = selection
  if (!anchorNode || !focusNode || !container.contains(anchorNode) || !container.contains(focusNode)) return null
  return normalizeQuote(selection.toString()) || null
}

/**
 * Где показать кнопку: под выделением (сверху у сенсорных экранов своё системное меню), по центру
 * выделения и в пределах окна; если снизу места нет — над выделением. Координаты для position: fixed.
 */
export function floatingPosition(rect: Rect, viewport: Size, size: Size = FLOATING_BUTTON_SIZE): { top: number; left: number } {
  const maxLeft = Math.max(MARGIN, viewport.width - size.width - MARGIN)
  const left = Math.min(Math.max(rect.left + rect.width / 2 - size.width / 2, MARGIN), maxLeft)
  const below = rect.bottom + GAP
  const top = below + size.height <= viewport.height - MARGIN ? below : Math.max(MARGIN, rect.top - GAP - size.height)
  return { top: Math.round(top), left: Math.round(left) }
}

/** Ctrl+Enter (⌘+Enter на macOS) — сообщить о выделенной ошибке. */
export function isReportShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
}
