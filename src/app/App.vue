<script setup lang="ts">
import { useThemeStore } from '@/features/toggle-theme'
import { APP_LINKS, APP_VERSION, env } from '@/shared/config'
import { AppHeader } from '@/widgets/app-header'

// Initializes theme (reads saved choice and applies the dark-mode class) before first paint.
useThemeStore()
</script>

<template>
  <AppHeader />
  <main class="app-main">
    <RouterView />
  </main>
  <footer class="app-footer">
    <span>{{ env.appTitle }} · v{{ APP_VERSION }}</span>
    <a :href="APP_LINKS.repository" target="_blank" rel="noopener noreferrer">GitHub</a>
  </footer>
</template>

<style lang="sass" scoped>
@use './App'
</style>
