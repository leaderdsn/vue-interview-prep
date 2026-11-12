<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { EmailSignIn, useSessionStore } from '@/entities/session'
import { fetchBundledLevel, findLevel, LEVEL_LABELS, TRACKS } from '@/entities/track'
import { adminPath, ContentEditor, useAdminStore } from '@/features/edit-content'
import { FeedbackReview, useReviewStore } from '@/features/review-feedback'
import { AnalyticsReport } from '@/features/view-analytics'

import type { Level, LevelOverride } from '@/entities/track'
import type { EditorFocus } from '@/features/edit-content'
import type { EditorTarget } from '@/features/review-feedback'

const session = useSessionStore()
const admin = useAdminStore()
const review = useReviewStore()

session.init()

type Section = 'content' | 'feedback' | 'stats'
const sectionOptions = computed<{ value: Section; label: string }[]>(() => [
  { value: 'content', label: 'Контент' },
  { value: 'feedback', label: review.newCount ? `Отзывы · ${review.newCount}` : 'Отзывы' },
  { value: 'stats', label: 'Статистика' },
])
const section = ref<Section>('content')

const trackOptions = TRACKS.map((track) => ({ value: track.id, label: track.title }))

const trackId = ref<string | null>(null)
const levelId = ref<string | null>(null)

const levelOptions = computed(() =>
  (TRACKS.find((track) => track.id === trackId.value)?.levels ?? []).map((level) => ({
    value: level.id,
    label: LEVEL_LABELS[level.level],
  })),
)

const level = ref<Level | null>(null)
const override = ref<LevelOverride | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
/** Несохранённые правки в редакторе: при смене уровня они пропадут, поэтому показываем предупреждение. */
const unsaved = ref(false)

watch(trackId, () => {
  // Переход из отзыва сам выбирает уровень: его не сбрасываем на первый.
  if (!levelOptions.value.some((option) => option.value === levelId.value)) {
    levelId.value = levelOptions.value[0]?.value ?? null
  }
})

// Счётчик новых отзывов на вкладке нужен сразу, поэтому список грузится, как только права подтверждены.
watch(
  () => admin.isAdmin,
  (isAdmin) => {
    if (isAdmin && !review.loaded && !review.loading) void review.load()
  },
  { immediate: true },
)

/** Тема или вопрос, к которому редактор перейдёт после загрузки уровня. */
const editorFocus = ref<(EditorFocus & { levelId: string }) | null>(null)
/** Переход из отзыва на другой уровень не выполняется, пока в редакторе есть несохранённые правки. */
const jumpBlocked = ref(false)

function openInEditor(target: EditorTarget) {
  const found = findLevel(target.levelId)
  if (!found) return
  if (unsaved.value && levelId.value !== target.levelId) {
    jumpBlocked.value = true
    return
  }
  jumpBlocked.value = false
  editorFocus.value = { ...target, key: Date.now() }
  section.value = 'content'
  trackId.value = found.track.id
  levelId.value = target.levelId
}

watch(levelId, (id) => {
  level.value = null
  override.value = null
  if (id) void load(id)
})

async function load(id: string) {
  loading.value = true
  loadError.value = null
  try {
    const [bundled, current] = await Promise.all([fetchBundledLevel(id), admin.loadOverride(id)])
    if (levelId.value !== id) return
    level.value = bundled
    override.value = current
  } catch (cause) {
    if (levelId.value === id) {
      loadError.value = cause instanceof Error ? cause.message : 'Не удалось загрузить уровень'
    }
  } finally {
    if (levelId.value === id) loading.value = false
  }
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__head">
      <h1 class="admin-page__title">Админка</h1>
      <p class="admin-page__lead">
        Во вкладке «Контент» правятся темы и тест уровня: правка сохраняется в базу и подменяет версию из сборки
        у всех пользователей, а JSON уровня с правками можно скачать для репозитория. Во вкладке «Отзывы» — замечания пользователей, во вкладке «Статистика» —
        посещения и SEO из Google Analytics.
      </p>
    </header>

    <Message v-if="!session.available" severity="warn">
      Firebase не настроен: заполните переменные VITE_FIREBASE_* (см. README), иначе сохранять правки некуда.
    </Message>

    <section v-else-if="!session.user" class="admin-page__gate">
      <p>Войдите аккаунтом администратора.</p>
      <div class="admin-page__sign-in">
        <Button label="Войти через Google" icon="pi pi-google" :loading="session.busy" @click="session.signIn()" />
        <p class="admin-page__or">или по почте</p>
        <EmailSignIn />
      </div>
      <Message v-if="session.error" severity="error" size="small">{{ session.error }}</Message>
    </section>

    <section v-else-if="admin.isAdmin === null" class="admin-page__gate" role="status">
      <ProgressSpinner class="admin-page__spinner" stroke-width="6" />
      Проверяем права…
    </section>

    <section v-else-if="!admin.isAdmin" class="admin-page__gate">
      <p>У аккаунта <b>{{ session.user.email }}</b> нет прав администратора.</p>
      <p class="admin-page__hint">
        Ваш uid: <code class="admin-page__uid">{{ session.user.uid }}</code>. Чтобы выдать права, в Firebase Console →
        Realtime Database добавьте запись <code>{{ adminPath(session.user.uid) }}</code> со значением <code>true</code>
        и обновите страницу.
      </p>
      <Button label="Выйти" icon="pi pi-sign-out" severity="secondary" variant="outlined" @click="session.signOut()" />
    </section>

    <template v-else>
      <div class="admin-page__toolbar">
        <SelectButton
          v-model="section"
          :options="sectionOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-label="Раздел админки"
        />
        <span class="admin-page__account">
          {{ session.user.email }} · uid <code class="admin-page__uid">{{ session.user.uid }}</code>
        </span>
        <Button label="Выйти" icon="pi pi-sign-out" severity="secondary" variant="text" size="small" @click="session.signOut()" />
      </div>

      <AnalyticsReport v-if="section === 'stats'" />

      <template v-if="section === 'feedback'">
        <Message v-if="jumpBlocked" severity="warn" size="small" closable @close="jumpBlocked = false">
          В редакторе есть несохранённые правки другого уровня: сохраните или отмените их во вкладке «Контент»,
          затем откройте отзыв снова.
        </Message>
        <FeedbackReview @open-editor="openInEditor" />
      </template>

      <!-- v-show, а не v-if: черновики редактора не пропадают при переходе в «Статистику» -->
      <div v-show="section === 'content'" class="admin-page__content">
        <div class="admin-page__toolbar">
          <Select
            v-model="trackId"
            :options="trackOptions"
            option-label="label"
            option-value="value"
            placeholder="Выберите направление"
            filter
            class="admin-page__select"
            aria-label="Направление"
          />
          <SelectButton
            v-if="levelOptions.length"
            v-model="levelId"
            :options="levelOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            aria-label="Уровень"
          />
        </div>

        <Message v-if="unsaved" severity="warn" size="small">
          Есть несохранённые правки: при смене направления или уровня они пропадут.
        </Message>

        <div v-if="loading" role="status">
          <span class="visually-hidden">Загружаем уровень…</span>
          <Skeleton height="12rem" />
        </div>
        <Message v-else-if="loadError" severity="error">
          Не удалось загрузить уровень или правку из базы: {{ loadError }}
        </Message>
        <ContentEditor
          v-else-if="level"
          :key="level.id"
          :level="level"
          :override="override"
          :focus="editorFocus?.levelId === level.id ? editorFocus : null"
          @changed="override = $event"
          @dirty="unsaved = $event"
        />
      </div>
    </template>
  </div>
</template>

<style lang="sass" scoped>
@use './AdminPage'
</style>
