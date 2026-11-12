<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
  describeContext,
  FEEDBACK_INTERVAL_MS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KINDS,
  FEEDBACK_LIMITS,
  feedbackError,
  feedbackErrorMessage,
  feedbackIssues,
  sendFeedback,
} from '@/entities/feedback'
import { useSessionStore } from '@/entities/session'
import { trackEvent } from '@/shared/lib'

import { useFeedbackStore } from '../model/feedbackStore'

import type { FeedbackKind } from '@/entities/feedback'

const feedback = useFeedbackStore()
const session = useSessionStore()

const kindOptions = FEEDBACK_KINDS.map((value) => ({ value, label: FEEDBACK_KIND_LABELS[value] }))

const kind = ref<FeedbackKind>('suggestion')
const text = ref('')
const email = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
/** Ошибки заполнения показываются после первой попытки отправить, а не с первого символа. */
const attempted = ref(false)

const context = computed(() => feedback.request?.context ?? { page: '/' })
const issues = computed(() => feedbackIssues({ kind: kind.value, text: text.value, email: email.value }))
const textLength = computed(() => text.value.trim().length)
const textInvalid = computed(() => textLength.value < FEEDBACK_LIMITS.textMin || textLength.value > FEEDBACK_LIMITS.textMax)

// Каждое открытие — новое замечание: тип по месту открытия, почта вошедшего пользователя.
watch(
  () => feedback.request,
  (request) => {
    if (!request) return
    kind.value = request.kind
    text.value = ''
    email.value = session.user?.email ?? ''
    error.value = null
    attempted.value = false
  },
  { immediate: true },
)

async function submit() {
  attempted.value = true
  error.value = null
  if (issues.value.length || busy.value || !feedback.request) return
  if (feedback.lastSentAt !== null && Date.now() - feedback.lastSentAt < FEEDBACK_INTERVAL_MS) {
    error.value = feedbackError('too-frequent').message
    return
  }
  busy.value = true
  try {
    const uid = await session.ensureUid()
    await sendFeedback({ kind: kind.value, text: text.value, email: email.value, context: context.value }, uid)
    trackEvent('feedback_sent', { kind: kind.value })
    feedback.markSent()
  } catch (cause) {
    error.value = feedbackErrorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog
    v-model:visible="feedback.visible"
    modal
    dismissable-mask
    :draggable="false"
    header="Замечание или предложение"
    class="feedback-form-dialog"
    :style="{ width: 'min(36rem, calc(100vw - 2rem))' }"
  >
    <form class="feedback-form" novalidate @submit.prevent="submit">
      <div class="feedback-form__context" aria-label="Где оставлено замечание">
        <span class="feedback-form__where">
          <i class="pi pi-map-marker" aria-hidden="true" />
          {{ describeContext(context) }}
        </span>
        <blockquote v-if="context.quote" class="feedback-form__quote">{{ context.quote }}</blockquote>
        <p v-if="context.questionText" class="feedback-form__question">Вопрос: {{ context.questionText }}</p>
      </div>

      <label class="feedback-form__field">
        <span>Тип</span>
        <Select v-model="kind" :options="kindOptions" option-label="label" option-value="value" />
      </label>

      <label class="feedback-form__field">
        <span>Комментарий</span>
        <Textarea
          v-model="text"
          rows="5"
          auto-resize
          autofocus
          required
          :maxlength="FEEDBACK_LIMITS.textMax"
          :invalid="attempted && textInvalid"
          placeholder="Что не так или что можно улучшить?"
        />
        <small class="feedback-form__hint">{{ textLength }} / {{ FEEDBACK_LIMITS.textMax }}</small>
      </label>

      <label class="feedback-form__field">
        <span>Почта для ответа (необязательно)</span>
        <InputText
          v-model="email"
          type="email"
          autocomplete="email"
          :maxlength="FEEDBACK_LIMITS.email"
          :invalid="attempted && issues.includes('Проверьте адрес почты')"
        />
        <small class="feedback-form__hint">Используется только чтобы ответить вам на это замечание</small>
      </label>

      <ul v-if="attempted && issues.length" class="feedback-form__issues" role="alert">
        <li v-for="issue in issues" :key="issue">{{ issue }}</li>
      </ul>
      <Message v-if="error" severity="error" size="small">{{ error }}</Message>

      <div class="feedback-form__actions">
        <Button label="Отмена" severity="secondary" variant="text" :disabled="busy" @click="feedback.close()" />
        <Button type="submit" label="Отправить" icon="pi pi-send" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>

<style lang="sass" scoped>
@use './FeedbackForm'
</style>
