import { describe, expect, it } from 'vitest'

import {
  DELETED_TOPIC,
  insertTopic,
  isStructureChanged,
  moveTopic,
  NEW_TOPIC_TITLE,
  quizDraftIssues,
  quizToDraft,
  quizToPublished,
  removeTopic,
} from './structure'
import { createTopicDrafts } from './topicDraft'

import type { LevelDraftState } from './structure'
import type { QuizQuestion } from '@/entities/track'

const question = (topic: number): QuizQuestion => ({
  topic,
  type: 'theory',
  question: `Вопрос к теме ${topic + 1}?`,
  options: ['а', 'б', 'в', 'г'],
  answer: 0,
  explanation: 'Так.',
})

const published = ['А', 'Б', 'В'].map((title) => ({ title, html: `<p>${title}</p>` }))

function state(): LevelDraftState {
  return { topics: createTopicDrafts(published), quiz: [question(0), question(1), question(2), question(1)] }
}

const titles = (value: LevelDraftState) => value.topics.map((topic) => topic.title)
const topicsOf = (value: LevelDraftState) => value.quiz.map((item) => item.topic)

describe('структура тем', () => {
  it('вставка темы сдвигает вопросы к темам после неё', () => {
    const next = insertTopic(state(), 1)

    expect(titles(next)).toEqual(['А', NEW_TOPIC_TITLE, 'Б', 'В'])
    expect(next.topics[1]?.origin).toBeNull()
    expect(topicsOf(next)).toEqual([0, 2, 3, 2])
  })

  it('по умолчанию тема добавляется в конец, номера вопросов не меняются', () => {
    const next = insertTopic(state())

    expect(titles(next)).toEqual(['А', 'Б', 'В', NEW_TOPIC_TITLE])
    expect(topicsOf(next)).toEqual([0, 1, 2, 1])
  })

  it('удаление темы помечает её вопросы и сдвигает вопросы к следующим темам', () => {
    const next = removeTopic(state(), 1)

    expect(titles(next)).toEqual(['А', 'В'])
    expect(topicsOf(next)).toEqual([0, DELETED_TOPIC, 1, DELETED_TOPIC])
    expect(next.quiz[1]?.lostTopic).toBe(1)
  })

  it('перестановка темы переносит вопросы вместе с ней', () => {
    const next = moveTopic(state(), 0, 2)

    expect(titles(next)).toEqual(['Б', 'В', 'А'])
    expect(topicsOf(next)).toEqual([2, 0, 1, 0])
    const same = state()
    expect(moveTopic(same, 0, 5)).toBe(same)
  })

  it('видит изменение структуры: число, порядок и новые темы', () => {
    expect(isStructureChanged(state().topics, 3)).toBe(false)
    expect(isStructureChanged(moveTopic(state(), 0, 1).topics, 3)).toBe(true)
    expect(isStructureChanged(removeTopic(state(), 2).topics, 3)).toBe(true)
    // Удалили последнюю и добавили новую на её место: число то же, но тема другая.
    expect(isStructureChanged(insertTopic(removeTopic(state(), 2)).topics, 3)).toBe(true)
  })

  it('после нескольких операций возвращает вопросы к опубликованным темам', () => {
    const changed = moveTopic(insertTopic(removeTopic(state(), 0), 0), 2, 1)

    expect(titles(changed)).toEqual([NEW_TOPIC_TITLE, 'В', 'Б'])
    expect(topicsOf(changed)).toEqual([DELETED_TOPIC, 2, 1, 2])
    expect(quizToPublished(changed.quiz, changed.topics).map((item) => item.topic)).toEqual([0, 1, 2, 1])
  })

  it('вопрос, перенесённый на новую тему, при отмене тем остаётся без темы', () => {
    const added = insertTopic(state())
    const moved = { ...added, quiz: added.quiz.map((item, index) => (index === 0 ? { ...item, topic: 3 } : item)) }

    expect(quizToPublished(moved.quiz, moved.topics)[0]?.topic).toBe(DELETED_TOPIC)
  })

  it('опубликованный тест переводится в номера тем черновика', () => {
    const changed = moveTopic(removeTopic(state(), 1), 1, 0)

    const quiz = quizToDraft([question(0), question(1), question(2)], changed.topics)

    expect(quiz.map((item) => item.topic)).toEqual([1, DELETED_TOPIC, 0])
    expect(quiz[1]?.lostTopic).toBe(1)
  })

  it('ошибки теста: вопрос удалённой темы и тема вне уровня', () => {
    expect(quizDraftIssues([{ ...question(0), topic: DELETED_TOPIC }, question(5)], 3)).toEqual([
      'Вопрос 1: тема удалена — выберите другую',
      'Вопрос 2: тема не выбрана или её нет в уровне',
    ])
    expect(quizDraftIssues([], 3)).toEqual(['в тесте нет вопросов'])
  })
})
