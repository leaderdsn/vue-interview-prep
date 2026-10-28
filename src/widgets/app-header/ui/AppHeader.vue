<script setup lang="ts">
import { ThemeToggle } from '@/features/toggle-theme'
import { APP_LINKS, env, ROUTE_NAMES } from '@/shared/config'
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <RouterLink :to="{ name: ROUTE_NAMES.home }" class="app-header__logo">
        <img src="/favicon.svg" alt="" width="28" height="28">
        <span class="app-header__title">{{ env.appTitle }}</span>
      </RouterLink>

      <div class="app-header__actions">
        <ThemeToggle />
        <Button
          as="a"
          :href="APP_LINKS.repository"
          target="_blank"
          rel="noopener noreferrer"
          icon="pi pi-github"
          aria-label="Репозиторий на GitHub"
          severity="secondary"
          variant="text"
          rounded
        />
      </div>
    </div>
  </header>
</template>

<style lang="sass" scoped>
@use './AppHeader'
</style>
