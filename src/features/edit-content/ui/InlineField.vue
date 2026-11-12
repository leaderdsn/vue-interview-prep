<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'

const { label, rows = 2 } = defineProps<{
  /** Подпись поля (видимая и для скринридеров). */
  label: string
  rows?: number
}>()

/** Строчный HTML: текст с <b>, <code>, <i>, <a>. */
const value = defineModel<string>({ required: true })

const root = useTemplateRef<HTMLElement>('root')

/** Оборачивает выделенный текст в тег; без выделения вставляет пустой тег в позицию курсора. */
async function wrap(tag: 'b' | 'code') {
  const textarea = root.value?.querySelector('textarea')
  const text = value.value
  const start = textarea?.selectionStart ?? text.length
  const end = textarea?.selectionEnd ?? text.length
  value.value = `${text.slice(0, start)}<${tag}>${text.slice(start, end)}</${tag}>${text.slice(end)}`
  await nextTick()
  // Курсор остаётся на обёрнутом тексте, чтобы можно было продолжить ввод.
  const shift = tag.length + 2
  textarea?.focus()
  textarea?.setSelectionRange(start + shift, end + shift)
}
</script>

<template>
  <div ref="root" class="inline-field">
    <div class="inline-field__bar">
      <span class="inline-field__label">{{ label }}</span>
      <Button label="b" severity="secondary" variant="text" size="small" :aria-label="`Жирный: ${label}`" class="inline-field__tool inline-field__tool--bold" @click="wrap('b')" />
      <Button label="code" severity="secondary" variant="text" size="small" :aria-label="`Код: ${label}`" class="inline-field__tool inline-field__tool--code" @click="wrap('code')" />
    </div>
    <Textarea v-model="value" :aria-label="label" auto-resize :rows="rows" spellcheck="true" class="inline-field__input" />
  </div>
</template>

<style lang="sass" scoped>
@use './InlineField'
</style>
