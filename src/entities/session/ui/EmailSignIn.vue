<script setup lang="ts">
import { computed, ref, useId } from 'vue'

import { useSessionStore } from '../model/sessionStore'

type Mode = 'signIn' | 'signUp' | 'reset'

const MIN_PASSWORD = 6

const session = useSessionStore()
const id = useId()

const mode = ref<Mode>('signIn')
const email = ref('')
const password = ref('')
const resetSentTo = ref<string | null>(null)
const passwordVisible = ref(false)

const submitLabel = computed(
  () => ({ signIn: 'Войти', signUp: 'Создать аккаунт', reset: 'Отправить письмо' })[mode.value],
)
const canSubmit = computed(
  () => email.value.trim() !== '' && (mode.value === 'reset' || password.value.length >= (mode.value === 'signUp' ? MIN_PASSWORD : 1)),
)

function switchTo(next: Mode) {
  mode.value = next
  resetSentTo.value = null
  session.clearError()
}

async function submit() {
  if (!canSubmit.value || session.busy) return
  if (mode.value === 'reset') {
    const address = email.value.trim()
    if (await session.resetPassword(address)) resetSentTo.value = address
    return
  }
  const ok =
    mode.value === 'signUp'
      ? await session.signUpWithEmail(email.value, password.value)
      : await session.signInWithEmail(email.value, password.value)
  if (ok) {
    password.value = ''
    passwordVisible.value = false
  }
}
</script>

<template>
  <form class="email-sign-in" novalidate @submit.prevent="submit">
    <label class="email-sign-in__field" :for="`${id}-email`">
      <span>Почта</span>
      <InputText
        :id="`${id}-email`"
        v-model="email"
        type="email"
        autocomplete="email"
        inputmode="email"
        size="small"
        fluid
      />
    </label>

    <label v-if="mode !== 'reset'" class="email-sign-in__field" :for="`${id}-password`">
      <span>Пароль</span>
      <span class="email-sign-in__password">
        <InputText
          :id="`${id}-password`"
          v-model="password"
          :type="passwordVisible ? 'text' : 'password'"
          :autocomplete="mode === 'signUp' ? 'new-password' : 'current-password'"
          autocapitalize="off"
          spellcheck="false"
          size="small"
          fluid
        />
        <button
          type="button"
          class="email-sign-in__eye"
          :aria-label="passwordVisible ? 'Скрыть пароль' : 'Показать пароль'"
          :title="passwordVisible ? 'Скрыть пароль' : 'Показать пароль'"
          :aria-pressed="passwordVisible"
          :aria-controls="`${id}-password`"
          @click="passwordVisible = !passwordVisible"
        >
          <i class="pi" :class="passwordVisible ? 'pi-eye-slash' : 'pi-eye'" aria-hidden="true" />
        </button>
      </span>
      <small v-if="mode === 'signUp'" class="email-sign-in__hint">Не меньше {{ MIN_PASSWORD }} символов</small>
    </label>

    <p v-if="mode === 'signUp'" class="email-sign-in__warning">
      После регистрации придёт письмо со ссылкой. Пока почта не подтверждена, прогресс не сохраняется в аккаунте.
    </p>

    <p v-if="mode === 'reset'" class="email-sign-in__hint">
      Пришлём ссылку, по которой можно задать новый пароль.
    </p>
    <p v-if="resetSentTo" class="email-sign-in__done" role="status">
      Письмо отправлено на {{ resetSentTo }}. Если его нет, проверьте папку «Спам».
    </p>

    <Button type="submit" :label="submitLabel" size="small" :loading="session.busy" :disabled="!canSubmit" />

    <div class="email-sign-in__links">
      <button v-if="mode !== 'signIn'" type="button" class="email-sign-in__link" @click="switchTo('signIn')">
        У меня есть аккаунт
      </button>
      <button v-if="mode !== 'signUp'" type="button" class="email-sign-in__link" @click="switchTo('signUp')">
        Создать аккаунт
      </button>
      <button v-if="mode === 'signIn'" type="button" class="email-sign-in__link" @click="switchTo('reset')">
        Забыли пароль?
      </button>
    </div>
  </form>
</template>

<style lang="sass" scoped>
@use './EmailSignIn'
</style>
