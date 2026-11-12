<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { MyFeedback } from '@/entities/feedback'
import { EmailSignIn, useSessionStore } from '@/entities/session'

import { SYNC_STATUS_LABELS } from '../config/sync'
import { useSyncStore } from '../model/syncStore'

const sync = useSyncStore()
const session = useSessionStore()
const { user, status, error, busy } = storeToRefs(sync)

const verificationSent = ref(false)
const stillUnverified = ref(false)
watch(
  () => user.value?.uid,
  () => {
    verificationSent.value = false
    stillUnverified.value = false
  },
)

async function resend() {
  verificationSent.value = await session.resendVerification()
}

async function checkVerified() {
  stillUnverified.value = !(await session.refreshVerification())
}

/** Раскрыт ли список «Мои замечания»; сам список перечитывается при каждом открытии окна. */
const showFeedback = ref(false)
watch(
  () => user.value?.uid,
  () => (showFeedback.value = false),
)

const popover = ref<{ toggle: (event: Event) => void } | null>(null)

// Фото Google иногда упираются в лимит запросов; тогда вместо них показывается первая буква.
const photoFailed = ref(false)
watch(() => user.value?.photoUrl, () => (photoFailed.value = false))

const displayName = computed(() => user.value?.name.split(' ')[0] || user.value?.email || '')
const initial = computed(() => (user.value?.name || user.value?.email || '?').charAt(0).toUpperCase())

const buttonLabel = computed(() =>
  user.value
    ? `Аккаунт ${user.value.email || user.value.name}: ${SYNC_STATUS_LABELS[status.value]}`
    : 'Сохранять прогресс в аккаунте',
)
</script>

<template>
  <template v-if="sync.available">
    <Button
      v-if="user"
      class="sync-button sync-button--account"
      :aria-label="buttonLabel"
      :title="buttonLabel"
      :severity="status === 'error' ? 'danger' : 'secondary'"
      variant="text"
      rounded
      aria-haspopup="dialog"
      @click="popover?.toggle($event)"
    >
      <span class="sync-button__avatar">
        <img
          v-if="user.photoUrl && !photoFailed"
          :src="user.photoUrl"
          alt=""
          width="28"
          height="28"
          referrerpolicy="no-referrer"
          @error="photoFailed = true"
        >
        <span v-else class="sync-button__initial" aria-hidden="true">{{ initial }}</span>
        <span class="sync-button__dot" :class="`sync-button__dot--${status}`" aria-hidden="true" />
      </span>
      <span class="sync-button__name">{{ displayName }}</span>
    </Button>
    <Button
      v-else
      class="sync-button"
      icon="pi pi-cloud-upload"
      :aria-label="buttonLabel"
      :title="buttonLabel"
      :severity="status === 'error' ? 'danger' : 'secondary'"
      variant="text"
      rounded
      aria-haspopup="dialog"
      @click="popover?.toggle($event)"
    />

    <Popover ref="popover">
      <div class="sync-panel">
        <template v-if="user && !user.emailVerified">
          <p class="sync-panel__title">{{ user.email }}</p>
          <div class="sync-panel__warning" role="alert">
            <b>Подтвердите почту.</b> Мы отправили на {{ user.email }} письмо со ссылкой. Пока почта не подтверждена,
            прогресс хранится только на этом устройстве и в аккаунт не сохраняется.
          </div>
          <p v-if="verificationSent" class="sync-panel__text" role="status">
            Письмо отправлено ещё раз. Если его нет, проверьте папку «Спам».
          </p>
          <p v-else-if="stillUnverified" class="sync-panel__text" role="status">
            Почта ещё не подтверждена. Перейдите по ссылке из письма и нажмите кнопку снова.
          </p>
          <div class="sync-panel__actions">
            <Button label="Я подтвердил" icon="pi pi-check" size="small" :loading="busy" @click="checkVerified" />
            <Button
              label="Отправить письмо ещё раз"
              severity="secondary"
              variant="outlined"
              size="small"
              :disabled="busy"
              @click="resend"
            />
          </div>
        </template>
        <template v-else-if="user">
          <p class="sync-panel__text">Прогресс синхронизируется с аккаунтом</p>
          <p class="sync-panel__title">{{ user.name || user.email }}</p>
          <p v-if="user.name" class="sync-panel__text">{{ user.email }}</p>
          <p class="sync-panel__status" :class="`sync-panel__status--${status}`" role="status">
            {{ SYNC_STATUS_LABELS[status] }}
          </p>
        </template>
        <template v-else>
          <p class="sync-panel__title">Прогресс на всех устройствах</p>
          <p class="sync-panel__text">
            Войдите через Google или по почте — прогресс будет сохраняться в аккаунте и подтягиваться на телефоне и
            компьютере.
            Уже пройденное на этом устройстве объединится с аккаунтом.
          </p>
        </template>

        <p v-if="error" class="sync-panel__error" role="alert">{{ error }}</p>

        <div v-if="user" class="sync-panel__feedback">
          <button
            type="button"
            class="sync-panel__toggle"
            :aria-expanded="showFeedback"
            aria-controls="my-feedback"
            @click="showFeedback = !showFeedback"
          >
            <i :class="showFeedback ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" aria-hidden="true" />
            Мои замечания
          </button>
          <MyFeedback v-if="showFeedback" id="my-feedback" :uid="user.uid" />
        </div>

        <Button
          v-if="user"
          label="Выйти"
          icon="pi pi-sign-out"
          severity="secondary"
          variant="outlined"
          size="small"
          @click="sync.signOut()"
        />
        <template v-else>
          <Button label="Войти через Google" icon="pi pi-google" size="small" :loading="busy" @click="sync.signIn()" />
          <p class="sync-panel__or">или по почте</p>
          <EmailSignIn />
        </template>
      </div>
    </Popover>
  </template>
</template>

<style lang="sass" scoped>
@use './SyncButton'
</style>
