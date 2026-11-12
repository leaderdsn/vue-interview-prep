import { computed, reactive, ref } from 'vue'

import { findIndexFile, findLevel, isValidQuiz, MAX_TOPICS, resolveOverride } from '@/entities/track'
import { downloadFile } from '@/shared/lib'

import { useAdminStore } from './adminStore'
import { cloneQuiz, finalizeQuiz, isSameQuiz } from './draft'
import { buildIndexFile } from './indexFile'
import {
  insertTopic,
  isStructureChanged,
  moveTopic,
  quizDraftIssues,
  quizToDraft,
  quizToPublished,
  removeTopic,
} from './structure'
import { buildLevelFile, createTopicDrafts, finalizeTopics, isSameTopics, topicDraftIssues } from './topicDraft'

import type { LevelDraftState, QuestionDraft } from './structure'
import type { TopicDraft } from './topicDraft'
import type { Level, LevelOverride } from '@/entities/track'

/**
 * Черновик уровня в редакторе: темы и тест вместе. Живёт в `ContentEditor`, поэтому переключение «Темы | Тест»
 * его не сбрасывает, а операции над темами (добавить, удалить, переставить) сразу пересчитывают номера тем в вопросах.
 *
 * «Опубликовано» — то, что видят пользователи: уровень после `resolveOverride` (те же правила, что у читателей).
 * Если структура тем изменилась (число, порядок, новые или удалённые темы), обе части сохраняются одним `update`:
 * иначе в базе оказался бы тест, ссылающийся на темы по старым номерам.
 */
export function useLevelDraft(
  level: Level,
  override: () => LevelOverride | null,
  /** Запись, которая теперь в базе (null после удаления). */
  onChanged: (next: LevelOverride | null) => void,
) {
  const admin = useAdminStore()

  const resolved = computed(() => resolveOverride(level, override()))
  const publishedTopics = computed(() => resolved.value.level.topics)
  const publishedQuiz = computed(() => resolved.value.level.quiz)

  const topics = ref<TopicDraft[]>(createTopicDrafts(publishedTopics.value))
  const quiz = ref<QuestionDraft[]>(cloneQuiz(publishedQuiz.value))

  const structureChanged = computed(() => isStructureChanged(topics.value, publishedTopics.value.length))
  const topicsDirty = computed(() => !isSameTopics(topics.value, publishedTopics.value))
  const quizDirty = computed(() => !isSameQuiz(quiz.value, publishedQuiz.value))
  const dirty = computed(() => topicsDirty.value || quizDirty.value)

  const topicIssues = computed(() => topicDraftIssues(topics.value))
  /** Тест проверяется по числу тем черновика: после сохранения именно столько тем увидят пользователи. */
  const quizIssues = computed(() => quizDraftIssues(finalizeQuiz(quiz.value), topics.value.length))

  /** Что мешает сохранить темы: при изменённой структуре вместе с ними сохраняется тест, его ошибки тоже важны. */
  const topicsSaveIssues = computed(() =>
    structureChanged.value ? [...topicIssues.value, ...quizIssues.value.map((issue) => `Тест. ${issue}`)] : topicIssues.value,
  )
  const quizSaveIssues = computed(() =>
    structureChanged.value ? [...quizIssues.value, ...topicIssues.value.map((issue) => `Темы. ${issue}`)] : quizIssues.value,
  )

  /** Сброс тем удалит и тест из базы: тест правки ссылается на темы, которых нет в сборке. */
  const resetTopicsResetsQuiz = computed(() => {
    const current = override()
    return Boolean(current?.topics && current.quiz) && !isValidQuiz(current?.quiz, level.topics.length)
  })
  /** Сброс теста удалит и темы из базы: тест из сборки не подходит к темам правки. */
  const resetQuizResetsTopics = computed(
    () => Boolean(override()?.quiz) && resolved.value.topicsApplied && !isValidQuiz(level.quiz, publishedTopics.value.length),
  )

  const state = (): LevelDraftState => ({ topics: topics.value, quiz: quiz.value })
  function setState(next: LevelDraftState) {
    topics.value = next.topics
    quiz.value = next.quiz
  }

  /** Правка заголовка или блоков одной темы (структура тем не меняется). */
  function updateTopic(index: number, fields: Partial<Pick<TopicDraft, 'title' | 'blocks'>>) {
    topics.value = topics.value.map((topic, i) => (i === index ? { ...topic, ...fields } : topic))
  }

  /** Новый список вопросов (добавление, удаление, перестановка вопросов или правка одного). */
  function setQuiz(next: QuestionDraft[]) {
    quiz.value = next
  }

  /** Добавляет тему в конец; возвращает её номер (с 0) или null, если тем уже `MAX_TOPICS`. */
  function addTopic(): number | null {
    if (topics.value.length >= MAX_TOPICS) return null
    setState(insertTopic(state()))
    return topics.value.length - 1
  }

  /** Последнюю тему удалить нельзя: в уровне должна быть хотя бы одна. */
  function deleteTopic(index: number) {
    if (topics.value.length <= 1) return
    setState(removeTopic(state(), index))
  }

  function moveTopicBy(index: number, offset: -1 | 1) {
    setState(moveTopic(state(), index, index + offset))
  }

  /** Черновики после записи в базу: то, что теперь видят пользователи. */
  function publish(next: LevelOverride | null) {
    onChanged(next)
    return resolveOverride(level, next).level
  }

  async function saveTopicsAndQuiz() {
    const published = publish(await admin.saveTopicsAndQuiz(level.id, finalizeTopics(topics.value), quiz.value))
    topics.value = createTopicDrafts(published.topics)
    quiz.value = cloneQuiz(published.quiz)
  }

  async function saveTopics() {
    if (structureChanged.value) return saveTopicsAndQuiz()
    const published = publish(await admin.saveTopics(level.id, finalizeTopics(topics.value)))
    // Черновик пересобирается из того, что теперь видят пользователи (HTML уже очищен); тест не меняется.
    topics.value = createTopicDrafts(published.topics)
  }

  async function saveQuiz() {
    if (structureChanged.value) return saveTopicsAndQuiz()
    publish(await admin.saveQuiz(level.id, quiz.value))
  }

  function discardTopics() {
    // Номера тем в вопросах возвращаются к опубликованным темам вместе с самими темами.
    quiz.value = quizToPublished(quiz.value, topics.value)
    topics.value = createTopicDrafts(publishedTopics.value)
  }

  function discardQuiz() {
    quiz.value = quizToDraft(cloneQuiz(publishedQuiz.value), topics.value)
  }

  async function resetTopics() {
    const all = resetTopicsResetsQuiz.value
    const keptQuiz = quizDirty.value ? quizToPublished(quiz.value, topics.value) : null
    const published = publish(await admin.resetPart(level.id, all ? 'all' : 'topics'))
    topics.value = createTopicDrafts(published.topics)
    quiz.value = !all && keptQuiz ? keptQuiz : cloneQuiz(published.quiz)
  }

  async function resetQuiz() {
    const all = resetQuizResetsTopics.value
    const published = publish(await admin.resetPart(level.id, all ? 'all' : 'quiz'))
    if (all) topics.value = createTopicDrafts(published.topics)
    quiz.value = quizToDraft(cloneQuiz(published.quiz), topics.value)
  }

  const summary = findLevel(level.id)?.level ?? null
  const indexFile = findIndexFile(level.id)
  const titles = computed(() => topics.value.map((topic) => topic.title))
  /** Число тем отличается от индекса направлений в репозитории (главная, пререндер, sitemap). */
  const topicCountChanged = computed(() => topics.value.length !== (summary?.topicTitles.length ?? level.topics.length))
  /** Заголовки тем или число вопросов отличаются от индекса: без нового индекса `content.spec.ts` упадёт. */
  const indexChanged = computed(
    () =>
      !summary ||
      summary.quizCount !== quiz.value.length ||
      JSON.stringify(summary.topicTitles) !== JSON.stringify(titles.value),
  )

  /** Файл уровня с текущими черновиками обеих частей, чтобы скачивание не теряло другую часть. */
  function downloadLevel() {
    const file = buildLevelFile(level, finalizeTopics(topics.value), finalizeQuiz(quiz.value))
    downloadFile(`${level.id}.json`, `${JSON.stringify(file, null, 2)}\n`)
  }

  /** Индекс направлений (тот из двух файлов, где описан уровень) с заголовками тем и числом вопросов из черновиков. */
  function downloadIndex() {
    if (!indexFile) return
    downloadFile(indexFile.fileName, buildIndexFile(indexFile, level.id, topics.value, quiz.value.length))
  }

  return reactive({
    topics,
    quiz,
    titles,
    publishedTopics,
    publishedQuiz,
    topicsApplied: computed(() => resolved.value.topicsApplied),
    quizApplied: computed(() => resolved.value.quizApplied),
    structureChanged,
    topicsDirty,
    quizDirty,
    dirty,
    topicIssues,
    quizIssues,
    topicsSaveIssues,
    quizSaveIssues,
    resetTopicsResetsQuiz,
    resetQuizResetsTopics,
    topicCountChanged,
    indexChanged,
    indexFileName: indexFile?.fileName ?? null,
    updateTopic,
    setQuiz,
    addTopic,
    deleteTopic,
    moveTopicBy,
    saveTopics,
    saveQuiz,
    discardTopics,
    discardQuiz,
    resetTopics,
    resetQuiz,
    downloadLevel,
    downloadIndex,
  })
}

export type LevelDraft = ReturnType<typeof useLevelDraft>
