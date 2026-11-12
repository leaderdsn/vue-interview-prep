import { questionIssues } from '@/entities/track'

import { createBlock } from './blocks'
import { moveItem } from './draft'

import type { TopicDraft } from './topicDraft'
import type { QuizQuestion } from '@/entities/track'

/*
 * Структура тем уровня в редакторе: добавление, удаление и перестановка тем вместе с пересчётом
 * `question.topic` в черновике теста. Темы и тест — один черновик уровня: вопрос ссылается на тему по номеру,
 * поэтому любая операция над темами сразу переписывает номера в вопросах.
 */

/** Номер темы у вопроса, тема которого удалена: такой вопрос нельзя сохранить, пока не выбрана другая тема. */
export const DELETED_TOPIC = -1

export const NEW_TOPIC_TITLE = 'Новая тема'

/**
 * Вопрос черновика. `lostTopic` — номер удалённой темы среди опубликованных: «Отменить изменения» у тем
 * вернёт вопрос к ней. При сохранении поле отбрасывается (`finalizeQuiz`).
 */
export type QuestionDraft = QuizQuestion & { lostTopic?: number }

/** Черновик уровня: темы и тест, номера тем в вопросах — по текущему списку тем черновика. */
export type LevelDraftState = { topics: TopicDraft[]; quiz: QuestionDraft[] }

/**
 * Переписывает номера тем в вопросах по таблице «старый номер → новый» (null — тема удалена).
 * Вопросы с уже удалённой или неизвестной темой не трогаются.
 */
function remapQuiz(state: LevelDraftState, next: readonly (number | null)[]): QuestionDraft[] {
  return state.quiz.map((question) => {
    if (question.topic < 0 || question.topic >= next.length) return question
    const target = next[question.topic]
    if (target !== null && target !== undefined) {
      return target === question.topic ? question : { ...question, topic: target }
    }
    const origin = state.topics[question.topic]?.origin ?? question.lostTopic
    return { ...question, topic: DELETED_TOPIC, ...(origin === undefined || origin === null ? {} : { lostTopic: origin }) }
  })
}

export function createTopic(): TopicDraft {
  // Первый блок темы без перевода строки перед ним, как в файлах уровней.
  return { title: NEW_TOPIC_TITLE, blocks: [{ ...createBlock('paragraph'), before: '' }], origin: null }
}

/** Вставляет новую тему на место `at`: темы с этого номера и вопросы к ним сдвигаются на один. */
export function insertTopic(state: LevelDraftState, at: number = state.topics.length): LevelDraftState {
  const position = Math.min(Math.max(at, 0), state.topics.length)
  return {
    topics: [...state.topics.slice(0, position), createTopic(), ...state.topics.slice(position)],
    quiz: remapQuiz(
      state,
      state.topics.map((_, index) => (index < position ? index : index + 1)),
    ),
  }
}

/** Удаляет тему: вопросы к ней помечаются «тема удалена», вопросы к следующим темам сдвигаются. */
export function removeTopic(state: LevelDraftState, at: number): LevelDraftState {
  if (at < 0 || at >= state.topics.length) return state
  return {
    topics: state.topics.filter((_, index) => index !== at),
    quiz: remapQuiz(
      state,
      state.topics.map((_, index) => (index === at ? null : index < at ? index : index - 1)),
    ),
  }
}

/** Переставляет тему; вопросы следуют за своими темами. */
export function moveTopic(state: LevelDraftState, from: number, to: number): LevelDraftState {
  const order = moveItem(
    state.topics.map((_, index) => index),
    from,
    to,
  )
  if (order.every((value, index) => value === index)) return state
  return {
    topics: order.map((index) => state.topics[index] as TopicDraft),
    quiz: remapQuiz(
      state,
      state.topics.map((_, index) => order.indexOf(index)),
    ),
  }
}

/** Изменилась ли структура тем относительно опубликованных: число, порядок, новые или удалённые темы. */
export function isStructureChanged(topics: readonly TopicDraft[], publishedCount: number): boolean {
  return topics.length !== publishedCount || topics.some((topic, index) => topic.origin !== index)
}

/**
 * Номера тем в вопросах — по опубликованным темам (для «Отменить изменения» у тем): вопрос к новой теме
 * помечается «тема удалена», вопрос к удалённой теме возвращается к ней.
 */
export function quizToPublished(quiz: readonly QuestionDraft[], topics: readonly TopicDraft[]): QuestionDraft[] {
  return quiz.map(({ lostTopic, ...question }) => {
    const origin = question.topic === DELETED_TOPIC ? lostTopic : (topics[question.topic]?.origin ?? lostTopic)
    return { ...question, topic: origin ?? DELETED_TOPIC }
  })
}

/** Опубликованный тест (номера по опубликованным темам) — в номера тем черновика. */
export function quizToDraft(quiz: readonly QuizQuestion[], topics: readonly TopicDraft[]): QuestionDraft[] {
  return quiz.map((question) => {
    const index = topics.findIndex((topic) => topic.origin === question.topic)
    return index === -1 ? { ...question, topic: DELETED_TOPIC, lostTopic: question.topic } : { ...question, topic: index }
  })
}

/** Ошибки вопроса черновика: для вопроса удалённой темы — понятное «тема удалена». */
export function questionDraftIssues(question: QuizQuestion, topicCount: number): string[] {
  if (question.topic !== DELETED_TOPIC) return questionIssues(question, topicCount)
  return ['тема удалена — выберите другую', ...questionIssues({ ...question, topic: 0 }, Math.max(topicCount, 1))]
}

/** Ошибки теста черновика по текущему числу тем черновика: «Вопрос 3: тема удалена — выберите другую». */
export function quizDraftIssues(quiz: readonly QuizQuestion[], topicCount: number): string[] {
  if (quiz.length === 0) return ['в тесте нет вопросов']
  return quiz.flatMap((question, index) =>
    questionDraftIssues(question, topicCount).map((issue) => `Вопрос ${index + 1}: ${issue}`),
  )
}
