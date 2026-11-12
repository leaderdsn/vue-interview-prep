<script setup lang="ts">
import { computed } from 'vue'

import { sanitizeTopicHtml } from '@/entities/track'

import { BLOCK_LABELS, patchBlock, SAY_EYEBROW, serializeBlock } from '../model/blocks'
import { blockIssues } from '../model/topicDraft'

import InlineField from './InlineField.vue'

import type { Block, BlockFieldValues } from '../model/blocks'

const { index, total } = defineProps<{
  index: number
  total: number
}>()

const emit = defineEmits<{
  move: [offset: -1 | 1]
  remove: []
  duplicate: []
}>()

const block = defineModel<Block>({ required: true })

const title = computed(() => `${index + 1}. ${BLOCK_LABELS[block.value.type]}`)
const html = computed(() => serializeBlock(block.value))
/** Предпросмотр всегда очищен: в блоке HTML может оказаться что угодно. */
const preview = computed(() => sanitizeTopicHtml(html.value))
const stripped = computed(() => preview.value !== html.value)
const issues = computed(() => blockIssues(block.value))

// Суженные варианты блока для шаблона.
const text = computed(() => ('html' in block.value && block.value.type !== 'html' ? block.value : null))
const raw = computed(() => (block.value.type === 'html' ? block.value : null))
const list = computed(() => (block.value.type === 'list' ? block.value : null))
const code = computed(() => (block.value.type === 'code' ? block.value : null))
const table = computed(() => (block.value.type === 'table' ? block.value : null))

const listOptions = [
  { value: false, label: 'Маркированный' },
  { value: true, label: 'Нумерованный' },
]

function patch(fields: BlockFieldValues) {
  block.value = patchBlock(block.value, fields)
}

const replaceAt = <T,>(items: readonly T[], at: number, value: T) => items.map((item, i) => (i === at ? value : item))
const removeAt = <T,>(items: readonly T[], at: number) => items.filter((_, i) => i !== at)

function setItem(at: number, value: string) {
  if (list.value) patch({ items: replaceAt(list.value.items, at, value) })
}

function setHead(column: number, value: string) {
  if (table.value) patch({ head: replaceAt(table.value.head, column, value) })
}

function setCell(row: number, column: number, value: string) {
  if (table.value) patch({ rows: table.value.rows.map((cells, r) => (r === row ? replaceAt(cells, column, value) : cells)) })
}

function addRow() {
  if (table.value) patch({ rows: [...table.value.rows, table.value.head.map(() => '')] })
}

function addColumn() {
  if (table.value) patch({ head: [...table.value.head, ''], rows: table.value.rows.map((cells) => [...cells, '']) })
}

function removeColumn(column: number) {
  if (table.value) patch({ head: removeAt(table.value.head, column), rows: table.value.rows.map((cells) => removeAt(cells, column)) })
}
</script>

<template>
  <section class="block-card" :class="{ 'block-card--invalid': issues.length > 0 }" :aria-label="`Блок ${title}`">
    <header class="block-card__head">
      <span class="block-card__title">{{ title }}</span>
      <span v-if="block.source" class="block-card__badge" title="Сохранится в исходном виде, пока блок не изменён">без изменений</span>
      <span class="block-card__actions">
        <Button icon="pi pi-arrow-up" severity="secondary" variant="text" size="small" :aria-label="`Поднять блок ${index + 1}`" :disabled="index === 0" @click="emit('move', -1)" />
        <Button icon="pi pi-arrow-down" severity="secondary" variant="text" size="small" :aria-label="`Опустить блок ${index + 1}`" :disabled="index === total - 1" @click="emit('move', 1)" />
        <Button icon="pi pi-copy" severity="secondary" variant="text" size="small" :aria-label="`Дублировать блок ${index + 1}`" @click="emit('duplicate')" />
        <Button icon="pi pi-trash" severity="danger" variant="text" size="small" :aria-label="`Удалить блок ${index + 1}`" @click="emit('remove')" />
      </span>
    </header>

    <div class="block-card__body">
      <div class="block-card__form">
        <template v-if="text">
          <p v-if="text.type === 'say'" class="block-card__hint">Подпись «{{ SAY_EYEBROW }}» добавляется сама, пишите только фразу.</p>
          <InlineField
            :model-value="text.html"
            :label="BLOCK_LABELS[text.type]"
            :rows="text.type === 'heading' ? 1 : 3"
            @update:model-value="patch({ html: $event })"
          />
        </template>

        <template v-else-if="list">
          <SelectButton
            :model-value="list.ordered"
            :options="listOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            aria-label="Вид списка"
            @update:model-value="patch({ ordered: $event })"
          />
          <div v-for="(item, itemIndex) in list.items" :key="itemIndex" class="block-card__item">
            <InlineField :model-value="item" :label="`Пункт ${itemIndex + 1}`" @update:model-value="setItem(itemIndex, $event)" />
            <Button
              icon="pi pi-times"
              severity="secondary"
              variant="text"
              size="small"
              :aria-label="`Удалить пункт ${itemIndex + 1}`"
              @click="patch({ items: removeAt(list.items, itemIndex) })"
            />
          </div>
          <Button label="Добавить пункт" icon="pi pi-plus" severity="secondary" variant="text" size="small" class="block-card__add" @click="patch({ items: [...list.items, ''] })" />
        </template>

        <template v-else-if="code">
          <label class="editor-field">
            <span>Подпись файла (необязательно)</span>
            <InputText :model-value="code.label" placeholder="components/Example.vue" @update:model-value="patch({ label: $event ?? '' })" />
          </label>
          <label class="editor-field">
            <span>Код — обычный текст; комментарии // и # выделятся сами</span>
            <Textarea class="editor-code" :model-value="code.code" auto-resize rows="4" spellcheck="false" @update:model-value="patch({ code: $event })" />
          </label>
        </template>

        <template v-else-if="table">
          <div class="block-card__table-wrap">
            <table class="block-card__table">
              <thead>
                <tr>
                  <th v-for="(cell, column) in table.head" :key="column">
                    <div class="block-card__cell">
                      <Textarea :model-value="cell" auto-resize rows="1" :aria-label="`Заголовок колонки ${column + 1}`" @update:model-value="setHead(column, $event)" />
                      <Button
                        icon="pi pi-times"
                        severity="secondary"
                        variant="text"
                        size="small"
                        :aria-label="`Удалить колонку ${column + 1}`"
                        :disabled="table.head.length === 1"
                        @click="removeColumn(column)"
                      />
                    </div>
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="(cells, row) in table.rows" :key="row">
                  <td v-for="(cell, column) in cells" :key="column">
                    <Textarea :model-value="cell" auto-resize rows="1" :aria-label="`Строка ${row + 1}, колонка ${column + 1}`" @update:model-value="setCell(row, column, $event)" />
                  </td>
                  <td>
                    <Button icon="pi pi-times" severity="secondary" variant="text" size="small" :aria-label="`Удалить строку ${row + 1}`" @click="patch({ rows: removeAt(table.rows, row) })" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="block-card__row">
            <Button label="Строка" icon="pi pi-plus" severity="secondary" variant="text" size="small" @click="addRow" />
            <Button label="Колонка" icon="pi pi-plus" severity="secondary" variant="text" size="small" @click="addColumn" />
          </div>
        </template>

        <label v-else-if="raw" class="editor-field">
          <span>HTML: схемы (figure, flow), карточки (boxes) и всё, что не подходит под другие блоки</span>
          <Textarea class="editor-code" :model-value="raw.html" auto-resize rows="4" spellcheck="false" @update:model-value="patch({ html: $event })" />
        </label>
      </div>

      <div class="block-card__preview" aria-label="Предпросмотр блока">
        <!-- eslint-disable-next-line vue/no-v-html -- HTML очищен sanitizeTopicHtml -->
        <div class="content" v-html="preview" />
      </div>
    </div>

    <p v-if="stripped" class="block-card__warn">
      Часть разметки не входит в белый список и будет удалена при сохранении (предпросмотр показывает итог).
    </p>
    <ul v-if="issues.length" class="block-card__issues">
      <li v-for="issue in issues" :key="issue">{{ issue }}</li>
    </ul>
  </section>
</template>

<style lang="sass" scoped>
@use './BlockEditor'
</style>
