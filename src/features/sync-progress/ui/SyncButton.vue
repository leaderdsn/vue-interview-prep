<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { SYNC_STATUS_LABELS } from '../config/sync'
import { useSyncStore } from '../model/syncStore'

const sync = useSyncStore()
const { user, status, error, busy } = storeToRefs(sync)

const popover = ref<{ toggle: (event: Event) => void } | null>(null)

// Google photos are sometimes rate-limited; the initial letter is shown instead.
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
        <template v-if="user">
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
            Войдите через Google — прогресс будет сохраняться в аккаунте и подтягиваться на телефоне и компьютере.
            Уже пройденное на этом устройстве объединится с аккаунтом.
          </p>
        </template>

        <p v-if="error" class="sync-panel__error" role="alert">{{ error }}</p>

        <Button
          v-if="user"
          label="Выйти"
          icon="pi pi-sign-out"
          severity="secondary"
          variant="outlined"
          size="small"
          @click="sync.signOut()"
        />
        <Button
          v-else
          label="Войти через Google"
          icon="pi pi-google"
          size="small"
          :loading="busy"
          @click="sync.signIn()"
        />
      </div>
    </Popover>
  </template>
</template>

<style lang="sass" scoped>
@use './SyncButton'
</style>
