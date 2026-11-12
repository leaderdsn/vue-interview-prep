<script setup lang="ts">
import { computed } from 'vue'

import type { Item } from '../model/report'

const { items, metric, empty = 'Нет данных за период' } = defineProps<{
  items: Item[]
  /** Название меры для заголовка столбца и подсказки: «Просмотры», «Сессии». */
  metric: string
  empty?: string
}>()

const numberFormat = new Intl.NumberFormat('ru-RU')
const percentFormat = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 0 })

const max = computed(() => Math.max(1, ...items.map((item) => item.value)))
const total = computed(() => items.reduce((sum, item) => sum + item.value, 0))

const share = (value: number) => (total.value ? percentFormat.format(value / total.value) : '')
</script>

<template>
  <p v-if="items.length === 0" class="bar-list__empty">{{ empty }}</p>
  <!-- Таблица, а не картинка: значения читаются экранным диктором, полоски только помогают сравнить. -->
  <table v-else class="bar-list">
    <colgroup>
      <col>
      <col class="bar-list__col-value">
      <col class="bar-list__col-share">
    </colgroup>
    <thead class="visually-hidden">
      <tr>
        <th scope="col">Название</th>
        <th scope="col">{{ metric }}</th>
        <th scope="col">Доля</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="item in items"
        :key="item.key"
        class="bar-list__row"
        :title="`${item.label}: ${numberFormat.format(item.value)} (${share(item.value)})`"
      >
        <th scope="row" class="bar-list__label">
          <span class="bar-list__name">{{ item.label }}</span>
          <span class="bar-list__track" aria-hidden="true">
            <span class="bar-list__bar" :style="{ width: `${(item.value / max) * 100}%` }" />
          </span>
        </th>
        <td class="bar-list__value">{{ numberFormat.format(item.value) }}</td>
        <td class="bar-list__share">{{ share(item.value) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style lang="sass" scoped>
@use './BarList'
</style>
