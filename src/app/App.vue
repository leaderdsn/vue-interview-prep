<script setup lang="ts">
import { ConsentBanner, useConsentStore } from '@/features/analytics-consent'
import { FeedbackHost, FeedbackLink } from '@/features/send-feedback'
import { useSyncStore } from '@/features/sync-progress'
import { useThemeStore } from '@/features/toggle-theme'
import { APP_LINKS, APP_VERSION, env, ROUTE_NAMES } from '@/shared/config'
import { AppHeader } from '@/widgets/app-header'

// Инициализирует тему (читает сохранённый выбор и ставит класс тёмного режима) до первой отрисовки.
useThemeStore()
// Восстанавливает сессию синхронизации у того, кто входил раньше; Firebase грузится только для него.
useSyncStore().init()
// Google Analytics включается только у тех, кто дал согласие.
const consent = useConsentStore()
consent.init()
</script>

<template>
  <AppHeader />
  <main class="app-main">
    <RouterView />
  </main>
  <footer class="app-footer">
    <span>{{ env.appTitle }} · v{{ APP_VERSION }}</span>
    <span class="app-footer__links">
      <button v-if="consent.available" type="button" class="app-footer__link" @click="consent.reopen()">Cookies</button>
      <FeedbackLink kind="suggestion" label="Обратная связь" plain />
      <RouterLink :to="{ name: ROUTE_NAMES.admin }">Редактор</RouterLink>
      <a :href="APP_LINKS.repository" target="_blank" rel="noopener noreferrer">GitHub</a>
    </span>
  </footer>
  <ConsentBanner />
  <FeedbackHost />
</template>

<style lang="sass" scoped>
@use './App'
</style>
