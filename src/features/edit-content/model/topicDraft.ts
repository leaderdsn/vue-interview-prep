import { sanitizeTopicHtml, topicsIssues } from '@/entities/track'

import { BLOCK_LABELS, parseBlocks, serializeBlocks } from './blocks'

import type { Block } from './blocks'
import type { Level, QuizQuestion, Topic } from '@/entities/track'

/**
 * Черновик темы в редакторе: заголовок и блоки текста.
 * `origin` — номер темы среди опубликованных (что сейчас видят пользователи), null у новой темы.
 * По нему видно, изменилась ли структура тем (число и порядок), и черновик теста можно вернуть к опубликованным номерам.
 */
export type TopicDraft = { title: string; blocks: Block[]; origin: number | null }

export function createTopicDrafts(topics: readonly Topic[]): TopicDraft[] {
  return topics.map((topic, index) => ({ title: topic.title, blocks: parseBlocks(topic.html), origin: index }))
}

/** Темы в виде для сохранения и скачивания: HTML собран из блоков и очищен по белому списку. */
export function finalizeTopics(drafts: readonly TopicDraft[]): Topic[] {
  return drafts.map((draft) => ({ title: draft.title, html: sanitizeTopicHtml(serializeBlocks(draft.blocks)) }))
}

/** Тема изменена относительно опубликованной (без правок блоки собираются в исходную строку). */
export function isTopicChanged(draft: TopicDraft, topic: Topic | undefined): boolean {
  return !topic || draft.title !== topic.title || serializeBlocks(draft.blocks) !== topic.html
}

/** Черновик совпадает с опубликованными темами: те же темы в том же порядке без правок. */
export function isSameTopics(drafts: readonly TopicDraft[], topics: readonly Topic[]): boolean {
  return (
    drafts.length === topics.length &&
    drafts.every((draft, index) => draft.origin === index && !isTopicChanged(draft, topics[index]))
  )
}

/** Ошибки блока, которые не дают сохранить тему. */
export function blockIssues(block: Block): string[] {
  switch (block.type) {
    case 'list':
      if (!block.items.length) return ['нет пунктов']
      return block.items.some((item) => !item.trim()) ? ['есть пустой пункт'] : []
    case 'code':
      return block.code.trim() ? [] : ['пустой код']
    case 'table':
      if (!block.head.length) return ['нет колонок']
      return block.rows.length ? [] : ['нет строк']
    default:
      return block.html.trim() ? [] : ['пустой текст']
  }
}

/** Ошибки черновика тем: число тем, пустые заголовки и текст, ошибки блоков. */
export function topicDraftIssues(drafts: readonly TopicDraft[]): string[] {
  const blocks = drafts.flatMap((draft, topicIndex) =>
    draft.blocks.flatMap((block, blockIndex) =>
      blockIssues(block).map(
        (issue) => `Тема ${topicIndex + 1}, блок ${blockIndex + 1} (${BLOCK_LABELS[block.type]}): ${issue}`,
      ),
    ),
  )
  return [...topicsIssues(finalizeTopics(drafts)), ...blocks]
}

/** Файл уровня для репозитория: уровень из сборки с текущими темами и тестом из редактора. */
export function buildLevelFile(level: Level, topics: readonly Topic[], quiz: readonly QuizQuestion[]): Level {
  return { ...level, topics: [...topics], quiz: [...quiz] }
}
