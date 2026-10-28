<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { THEME_MODE_OPTIONS } from '../config/theme'
import { useThemeStore } from '../model/themeStore'

import type { ThemeMode } from '../config/theme'

const themeStore = useThemeStore()
const { mode } = storeToRefs(themeStore)

function onChange(value: ThemeMode) {
  themeStore.setMode(value)
}
</script>

<template>
  <SelectButton
    class="theme-toggle"
    :model-value="mode"
    :options="[...THEME_MODE_OPTIONS]"
    option-value="value"
    option-label="label"
    :allow-empty="false"
    aria-label="Тема оформления"
    size="small"
    @update:model-value="onChange"
  >
    <template #option="{ option }">
      <span class="theme-toggle__option" :title="option.label">
        <i :class="option.icon" aria-hidden="true" />
        <span class="theme-toggle__label">{{ option.label }}</span>
      </span>
    </template>
  </SelectButton>
</template>

<style lang="sass" scoped>
@use './ThemeToggle'
</style>
