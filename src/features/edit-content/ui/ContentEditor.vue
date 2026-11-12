<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useLevelDraft } from '../model/levelDraft'

import QuizEditor from './QuizEditor.vue'
import TopicEditor from './TopicEditor.vue'

import type { EditorFocus } from '../model/focus'
import type { Level, LevelOverride } from '@/entities/track'

const { level, override, focus = null } = defineProps<{
  /** Уровень из сборки приложения. */
  level: Level
  /** Текущая правка в базе, если есть. */
  override: LevelOverride | null
  /** Тема или вопрос, к которому перейти (например, из замечания пользователя). */
  focus?: EditorFocus | null
}>()

const emit = defineEmits<{
  /** Запись, которая теперь в базе (null после удаления). */
  changed: [override: LevelOverride | null]
  /** Есть ли несохранённые правки (для предупреждения при смене уровня). */
  dirty: [dirty: boolean]
}>()

type Mode = 'topics' | 'quiz'
const mode = ref<Mode>('topics')

watch(
  () => focus?.key,
  () => {
    if (focus) mode.value = focus.step === 'quiz' ? 'quiz' : 'topics'
  },
  { immediate: true },
)

// Один черновик уровня на обе части: переключение «Темы | Тест» его не сбрасывает, «Скачать JSON уровня»
// отдаёт обе части, а добавление, удаление и перестановка тем сразу пересчитывают темы вопросов.
// Уровень у редактора не меняется (AdminPage пересоздаёт его по key), поэтому передаётся значением.
const draft = useLevelDraft(level, () => override, (next) => emit('changed', next))

const modeOptions = computed<{ value: Mode; label: string }[]>(() => [
  { value: 'topics', label: draft.topicsDirty ? 'Темы •' : 'Темы' },
  { value: 'quiz', label: draft.quizDirty ? 'Тест •' : 'Тест' },
])

watch(() => draft.dirty, (value) => emit('dirty', value), { immediate: true })

/** Браузер спрашивает подтверждение при закрытии вкладки с несохранёнными правками. */
function warnOnUnload(event: BeforeUnloadEvent) {
  if (!draft.dirty) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', warnOnUnload))
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnOnUnload)
  emit('dirty', false)
})

defineExpose({ draft })
</script>

<template>
  <div class="content-editor">
    <SelectButton
      v-model="mode"
      :options="modeOptions"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      aria-label="Что редактировать"
      class="content-editor__mode"
    />
    <KeepAlive>
      <TopicEditor v-if="mode === 'topics'" :draft="draft" :override="override" :focus="focus" />
      <QuizEditor v-else :draft="draft" :level="level" :override="override" :focus="focus" />
    </KeepAlive>
  </div>
</template>

<style lang="sass" scoped>
@use './ContentEditor'
</style>
