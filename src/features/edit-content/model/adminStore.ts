import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { useSessionStore } from '@/entities/session'
import { contentPath, parseOverride } from '@/entities/track'
import { loadFirebase } from '@/shared/lib'

import { finalizeQuiz } from './draft'

import type { LevelOverride, OverridePart, QuizQuestion, Topic } from '@/entities/track'

/** Администраторы прописываются в базе вручную: `interviewPrep/admins/<uid>: true` (проверяет database.rules.json). */
export const adminPath = (uid: string) => `interviewPrep/admins/${uid}`

/** Кто может редактировать контент, а также чтение и сохранение правок в базе. */
export const useAdminStore = defineStore('admin', () => {
  const session = useSessionStore()

  /** null, пока неизвестно (не вошёл или ещё проверяем). */
  const isAdmin = ref<boolean | null>(null)

  watch(
    () => session.user?.uid ?? null,
    async (uid) => {
      isAdmin.value = null
      if (!uid) return
      try {
        const { db, dbApi } = await loadFirebase()
        const snap = await dbApi.get(dbApi.ref(db, adminPath(uid)))
        if (session.user?.uid === uid) isAdmin.value = snap.val() === true
      } catch {
        // Правила запрещают читать чужой флаг администратора, поэтому ошибка означает «не администратор».
        if (session.user?.uid === uid) isAdmin.value = false
      }
    },
    { immediate: true },
  )

  /**
   * Текущая правка уровня, читается через SDK, а не REST: редактор должен отличать «правки нет»
   * от «не удалось прочитать», иначе сохранение могло бы молча затереть более новую правку.
   */
  async function loadOverride(levelId: string): Promise<LevelOverride | null> {
    const { db, dbApi } = await loadFirebase()
    const snap = await dbApi.get(dbApi.ref(db, contentPath(levelId)))
    return parseOverride(snap.val())
  }

  /**
   * Записывает части правки одним `update`: часть, которой нет в `parts` (тест или темы), не затирается.
   * Темы и тест вместе сохраняются, когда изменилась структура тем: номера тем в вопросах уже пересчитаны,
   * и в базе не должно оказаться теста, ссылающегося на чужие темы. Возвращает запись целиком, как она теперь лежит в базе.
   */
  async function saveParts(levelId: string, parts: Partial<Pick<LevelOverride, OverridePart>>): Promise<LevelOverride> {
    const { db, dbApi } = await loadFirebase()
    await dbApi.update(dbApi.ref(db, contentPath(levelId)), {
      ...parts,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user?.email ?? '',
    })
    const saved = await loadOverride(levelId)
    if (!saved) throw new Error('Правка не появилась в базе после сохранения')
    return saved
  }

  /** finalizeQuiz убирает реактивные прокси, служебные поля черновика и поля undefined, которые база не принимает. */
  function saveQuiz(levelId: string, quiz: readonly QuizQuestion[]): Promise<LevelOverride> {
    return saveParts(levelId, { quiz: finalizeQuiz(quiz) })
  }

  const plainTopics = (topics: readonly Topic[]) => topics.map(({ title, html }) => ({ title, html }))

  /** Темы должны быть уже проверены и очищены (`finalizeTopics`); здесь только снимаются прокси. */
  function saveTopics(levelId: string, topics: readonly Topic[]): Promise<LevelOverride> {
    return saveParts(levelId, { topics: plainTopics(topics) })
  }

  /** Темы и тест одним запросом — при добавлении, удалении или перестановке тем. */
  function saveTopicsAndQuiz(levelId: string, topics: readonly Topic[], quiz: readonly QuizQuestion[]): Promise<LevelOverride> {
    return saveParts(levelId, { topics: plainTopics(topics), quiz: finalizeQuiz(quiz) })
  }

  /**
   * Удаляет одну часть правки или всю запись (`'all'`). Если другой части нет, удаляется вся запись, чтобы в базе
   * не оставались одни сведения о сохранении. Возвращает оставшуюся правку или null.
   */
  async function resetPart(levelId: string, part: OverridePart | 'all'): Promise<LevelOverride | null> {
    const { db, dbApi } = await loadFirebase()
    const current = part === 'all' ? null : await loadOverride(levelId)
    const keepsOther = part !== 'all' && Boolean(current?.[part === 'quiz' ? 'topics' : 'quiz'])
    const path = keepsOther ? `${contentPath(levelId)}/${part}` : contentPath(levelId)
    await dbApi.remove(dbApi.ref(db, path))
    return keepsOther ? loadOverride(levelId) : null
  }

  return { isAdmin, loadOverride, saveQuiz, saveTopics, saveTopicsAndQuiz, resetPart }
})
