import { computed, reactive, ref } from 'vue'

import { findIndexFile, findLevel, isValidQuizVariants, MAX_QUIZ_VARIANTS, MAX_TOPICS, resolveOverride } from '@/entities/track'
import { downloadFile } from '@/shared/lib'

import { useAdminStore } from './adminStore'
import { cloneQuiz, createQuestion, finalizeQuiz, isSameQuiz } from './draft'
import { buildIndexFile } from './indexFile'
import {
  insertTopic,
  isStructureChanged,
  moveTopic,
  quizToDraft,
  quizToPublished,
  removeTopic,
  variantsDraftIssues,
} from './structure'
import { buildLevelFile, createTopicDrafts, finalizeTopics, isSameTopics, topicDraftIssues } from './topicDraft'

import type { LevelDraftState, QuestionDraft } from './structure'
import type { TopicDraft } from './topicDraft'
import type { Level, LevelOverride, QuizQuestion } from '@/entities/track'

const cloneVariants = (variants: readonly (readonly QuizQuestion[])[]): QuestionDraft[][] => variants.map((quiz) => cloneQuiz(quiz))

function isSameVariants(a: readonly (readonly QuizQuestion[])[], b: readonly (readonly QuizQuestion[])[]): boolean {
  return a.length === b.length && a.every((quiz, index) => isSameQuiz(quiz, b[index] ?? []))
}

/**
 * Черновик уровня в редакторе: темы и все варианты теста вместе; `quiz` — вариант, открытый в редакторе. Живёт в `ContentEditor`, поэтому переключение «Темы | Тест»
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
  const publishedVariants = computed(() => resolved.value.level.quizVariants)

  const topics = ref<TopicDraft[]>(createTopicDrafts(publishedTopics.value))
  const variants = ref<QuestionDraft[][]>(cloneVariants(publishedVariants.value))
  /** Номер варианта (с 0), открытого в редакторе. */
  const variant = ref(0)
  const quiz = computed<QuestionDraft[]>(() => variants.value[variant.value] ?? [])

  /** Новый список вариантов; открытый вариант остаётся в пределах списка. */
  function setVariants(next: QuestionDraft[][]) {
    variants.value = next
    if (variant.value >= next.length) variant.value = Math.max(next.length - 1, 0)
  }

  const structureChanged = computed(() => isStructureChanged(topics.value, publishedTopics.value.length))
  const topicsDirty = computed(() => !isSameTopics(topics.value, publishedTopics.value))
  const quizDirty = computed(() => !isSameVariants(variants.value, publishedVariants.value))
  const dirty = computed(() => topicsDirty.value || quizDirty.value)

  const topicIssues = computed(() => topicDraftIssues(topics.value))
  /** Тест проверяется по числу тем черновика: после сохранения именно столько тем увидят пользователи. */
  const quizIssues = computed(() => variantsDraftIssues(variants.value.map(finalizeQuiz), topics.value.length))

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
    return Boolean(current?.topics && current.quizVariants) && !isValidQuizVariants(current?.quizVariants, level.topics.length)
  })
  /** Сброс теста удалит и темы из базы: тест из сборки не подходит к темам правки. */
  const resetQuizResetsTopics = computed(
    () =>
      Boolean(override()?.quizVariants) &&
      resolved.value.topicsApplied &&
      !isValidQuizVariants(level.quizVariants, publishedTopics.value.length),
  )

  const state = (): LevelDraftState => ({ topics: topics.value, variants: variants.value })
  function setState(next: LevelDraftState) {
    topics.value = next.topics
    setVariants(next.variants)
  }

  /** Правка заголовка или блоков одной темы (структура тем не меняется). */
  function updateTopic(index: number, fields: Partial<Pick<TopicDraft, 'title' | 'blocks'>>) {
    topics.value = topics.value.map((topic, i) => (i === index ? { ...topic, ...fields } : topic))
  }

  /** Новый список вопросов открытого варианта (добавление, удаление, перестановка вопросов или правка одного). */
  function setQuiz(next: QuestionDraft[]) {
    variants.value = variants.value.map((item, index) => (index === variant.value ? next : item))
  }

  function selectVariant(index: number) {
    if (index >= 0 && index < variants.value.length) variant.value = index
  }

  /**
   * Добавляет вариант в конец и открывает его; возвращает номер (с 0) или null, если вариантов уже `MAX_QUIZ_VARIANTS`.
   * Новый вариант — заготовка с теми же темами и типами вопросов, что у первого: распределение по темам уже верное.
   */
  function addVariant(): number | null {
    if (variants.value.length >= MAX_QUIZ_VARIANTS) return null
    const template = variants.value[0] ?? []
    const blank = template.map((question): QuestionDraft => ({ ...createQuestion(question.topic), type: question.type }))
    variants.value = [...variants.value, blank]
    variant.value = variants.value.length - 1
    return variant.value
  }

  /** Последний вариант удалить нельзя: в тесте должен быть хотя бы один. */
  function removeVariant(index: number) {
    if (variants.value.length <= 1 || index < 0 || index >= variants.value.length) return
    variants.value = variants.value.filter((_, i) => i !== index)
    if (variant.value > index || variant.value >= variants.value.length) variant.value = Math.max(variant.value - 1, 0)
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
    const published = publish(await admin.saveTopicsAndQuiz(level.id, finalizeTopics(topics.value), variants.value))
    topics.value = createTopicDrafts(published.topics)
    setVariants(cloneVariants(published.quizVariants))
  }

  async function saveTopics() {
    if (structureChanged.value) return saveTopicsAndQuiz()
    const published = publish(await admin.saveTopics(level.id, finalizeTopics(topics.value)))
    // Черновик пересобирается из того, что теперь видят пользователи (HTML уже очищен); тест не меняется.
    topics.value = createTopicDrafts(published.topics)
  }

  async function saveQuiz() {
    if (structureChanged.value) return saveTopicsAndQuiz()
    publish(await admin.saveQuiz(level.id, variants.value))
  }

  function discardTopics() {
    // Номера тем в вопросах возвращаются к опубликованным темам вместе с самими темами.
    setVariants(variants.value.map((item) => quizToPublished(item, topics.value)))
    topics.value = createTopicDrafts(publishedTopics.value)
  }

  function discardQuiz() {
    setVariants(publishedVariants.value.map((item) => quizToDraft(cloneQuiz(item), topics.value)))
  }

  async function resetTopics() {
    const all = resetTopicsResetsQuiz.value
    const keptVariants = quizDirty.value ? variants.value.map((item) => quizToPublished(item, topics.value)) : null
    const published = publish(await admin.resetPart(level.id, all ? 'all' : 'topics'))
    topics.value = createTopicDrafts(published.topics)
    setVariants(!all && keptVariants ? keptVariants : cloneVariants(published.quizVariants))
  }

  async function resetQuiz() {
    const all = resetQuizResetsTopics.value
    const published = publish(await admin.resetPart(level.id, all ? 'all' : 'quiz'))
    if (all) topics.value = createTopicDrafts(published.topics)
    setVariants(published.quizVariants.map((item) => quizToDraft(cloneQuiz(item), topics.value)))
  }

  const summary = findLevel(level.id)?.level ?? null
  const indexFile = findIndexFile(level.id)
  const titles = computed(() => topics.value.map((topic) => topic.title))
  /** Число тем отличается от индекса направлений в репозитории (главная, пререндер, sitemap). */
  const topicCountChanged = computed(() => topics.value.length !== (summary?.topicTitles.length ?? level.topics.length))
  /** Заголовки тем, число вопросов или вариантов отличаются от индекса: без нового индекса `content.spec.ts` упадёт. */
  const indexChanged = computed(
    () =>
      !summary ||
      summary.quizCount !== (variants.value[0]?.length ?? 0) ||
      summary.quizVariants !== variants.value.length ||
      JSON.stringify(summary.topicTitles) !== JSON.stringify(titles.value),
  )

  /** Файл уровня с текущими черновиками обеих частей (все варианты теста), чтобы скачивание не теряло другую часть. */
  function downloadLevel() {
    const file = buildLevelFile(level, finalizeTopics(topics.value), variants.value.map(finalizeQuiz))
    downloadFile(`${level.id}.json`, `${JSON.stringify(file, null, 2)}\n`)
  }

  /** Индекс направлений (тот из двух файлов, где описан уровень) с заголовками тем, числом вопросов и вариантов из черновиков. */
  function downloadIndex() {
    if (!indexFile) return
    downloadFile(
      indexFile.fileName,
      buildIndexFile(indexFile, level.id, topics.value, { quizCount: variants.value[0]?.length ?? 0, quizVariants: variants.value.length }),
    )
  }

  return reactive({
    topics,
    variants,
    variant,
    quiz,
    titles,
    publishedTopics,
    publishedVariants,
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
    selectVariant,
    addVariant,
    removeVariant,
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
