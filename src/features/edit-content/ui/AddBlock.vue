<script setup lang="ts">
import { ref } from 'vue'

import { BLOCK_LABELS } from '../model/blocks'

import type { BlockType } from '../model/blocks'

const { compact = false } = defineProps<{
  /** Между блоками кнопка неприметнее, чем в конце списка. */
  compact?: boolean
}>()

const emit = defineEmits<{
  add: [type: BlockType]
}>()

const types = Object.keys(BLOCK_LABELS) as BlockType[]
const open = ref(false)

function choose(type: BlockType) {
  open.value = false
  emit('add', type)
}
</script>

<template>
  <div class="add-block" :class="{ 'add-block--compact': compact }">
    <Button
      v-if="!open"
      label="Добавить блок"
      icon="pi pi-plus"
      severity="secondary"
      :variant="compact ? 'text' : 'outlined'"
      size="small"
      class="add-block__toggle"
      @click="open = true"
    />
    <div v-else class="add-block__menu" role="group" aria-label="Тип нового блока">
      <Button
        v-for="type in types"
        :key="type"
        :label="BLOCK_LABELS[type]"
        severity="secondary"
        variant="outlined"
        size="small"
        @click="choose(type)"
      />
      <Button icon="pi pi-times" severity="secondary" variant="text" size="small" aria-label="Не добавлять блок" @click="open = false" />
    </div>
  </div>
</template>

<style lang="sass" scoped>
@use './AddBlock'
</style>
