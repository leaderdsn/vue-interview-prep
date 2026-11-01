<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { SYNC_STATUS_LABELS } from '../config/sync'
import { useSyncStore } from '../model/syncStore'

const sync = useSyncStore()
const { available, user, status, error, busy } = storeToRefs(sync)

const popover = ref<{ toggle: (event: Event) => void } | null>(null)

const icon = computed(() => {
  if (!user.value) return 'pi pi-cloud-upload'
  if (status.value === 'error') return 'pi pi-exclamation-triangle'
  return 'pi pi-cloud'
})

const buttonLabel = computed(() =>
  user.value ? `Синхронизация: ${SYNC_STATUS_LABELS[status.value]}` : 'Сохранять прогресс в аккаунте',
)
</script>

<template>
  <template v-if="available">
    <Button
      class="sync-button"
      :icon="icon"
      :aria-label="buttonLabel"
      :title="buttonLabel"
      :severity="status === 'error' ? 'danger' : 'secondary'"
      variant="text"
      rounded
      aria-haspopup="dialog"
      @click="popover?.toggle($event)"
    >
      <template v-if="user?.photoUrl" #icon>
        <img class="sync-button__avatar" :src="user.photoUrl" alt="" width="24" height="24" referrerpolicy="no-referrer">
      </template>
    </Button>

    <Popover ref="popover">
      <div class="sync-panel">
        <template v-if="user">
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
