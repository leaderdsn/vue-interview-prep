<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

export type TrendPoint = { date: string; value: number }

const { points, label } = defineProps<{ points: TrendPoint[]; label: string }>()

const HEIGHT = 220
const PAD = { top: 12, right: 12, bottom: 28, left: 44 }

const root = useTemplateRef<HTMLDivElement>('root')
const width = ref(640)
const hovered = ref<number | null>(null)

let observer: ResizeObserver | null = null
onMounted(() => {
  if (!root.value) return
  width.value = root.value.clientWidth || width.value
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = Math.max(240, entry.contentRect.width)
  })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

const numberFormat = new Intl.NumberFormat('ru-RU')
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fullDayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })

const formatDay = (date: string, full = false) => (full ? fullDayFormat : dayFormat).format(new Date(`${date}T00:00:00Z`))

/** «Красивый» верх шкалы: 1, 2 или 5 × 10ⁿ, чтобы подписи сетки были круглыми. */
function niceMax(value: number): number {
  if (value <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].map((k) => k * power).find((candidate) => candidate * 4 >= value) ?? power * 10
  return step * 4
}

const maxValue = computed(() => niceMax(Math.max(0, ...points.map((point) => point.value))))
const plotWidth = computed(() => width.value - PAD.left - PAD.right)
const plotHeight = HEIGHT - PAD.top - PAD.bottom

const x = (index: number) => PAD.left + (points.length <= 1 ? plotWidth.value / 2 : (index / (points.length - 1)) * plotWidth.value)
const y = (value: number) => PAD.top + plotHeight - (value / maxValue.value) * plotHeight

const ticks = computed(() => [0, 1, 2, 3, 4].map((step) => (maxValue.value / 4) * step))

const linePath = computed(() =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(''),
)
const areaPath = computed(() =>
  points.length
    ? `${linePath.value}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
    : '',
)

/** Подписи дат: первая, последняя и несколько между ними, чтобы не налезали друг на друга. */
const dateTicks = computed(() => {
  const count = Math.min(points.length, Math.max(2, Math.floor(plotWidth.value / 90)))
  if (points.length === 0) return []
  const step = (points.length - 1) / Math.max(1, count - 1)
  return Array.from({ length: count }, (_, i) => Math.round(i * step))
})

const active = computed(() => (hovered.value === null ? null : (points[hovered.value] ?? null)))

function onMove(event: PointerEvent) {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect()
  const relative = event.clientX - box.left - PAD.left
  const index = Math.round((relative / plotWidth.value) * (points.length - 1))
  hovered.value = Math.min(points.length - 1, Math.max(0, index))
}

function onKey(event: KeyboardEvent) {
  if (!points.length) return
  const current = hovered.value ?? points.length - 1
  if (event.key === 'ArrowLeft') hovered.value = Math.max(0, current - 1)
  else if (event.key === 'ArrowRight') hovered.value = Math.min(points.length - 1, current + 1)
  else return
  event.preventDefault()
}

const tooltipLeft = computed(() => {
  if (hovered.value === null) return 0
  return Math.min(width.value - 170, Math.max(0, x(hovered.value) - 85))
})
</script>

<template>
  <div ref="root" class="trend">
    <svg
      class="trend__svg"
      :width="width"
      :height="HEIGHT"
      role="img"
      :aria-label="`${label} по дням`"
      tabindex="0"
      @pointermove="onMove"
      @pointerleave="hovered = null"
      @keydown="onKey"
      @blur="hovered = null"
    >
      <g class="trend__grid">
        <template v-for="tick in ticks" :key="tick">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(tick)" :y2="y(tick)" />
          <text :x="PAD.left - 8" :y="y(tick)" text-anchor="end" dominant-baseline="middle">
            {{ numberFormat.format(tick) }}
          </text>
        </template>
        <text
          v-for="index in dateTicks"
          :key="`d${index}`"
          :x="x(index)"
          :y="HEIGHT - 8"
          :text-anchor="index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'"
        >
          {{ points[index] ? formatDay(points[index].date) : '' }}
        </text>
      </g>

      <path class="trend__area" :d="areaPath" />
      <path class="trend__line" :d="linePath" />

      <g v-if="active && hovered !== null">
        <line class="trend__crosshair" :x1="x(hovered)" :x2="x(hovered)" :y1="PAD.top" :y2="y(0)" />
        <circle class="trend__dot" :cx="x(hovered)" :cy="y(active.value)" r="5" />
      </g>
    </svg>

    <div v-if="active" class="trend__tooltip" :style="{ left: `${tooltipLeft}px` }" role="status">
      <span class="trend__tooltip-date">{{ formatDay(active.date, true) }}</span>
      <b>{{ numberFormat.format(active.value) }}</b> {{ label.toLowerCase() }}
    </div>
  </div>
</template>

<style lang="sass" scoped>
@use './TrendChart'
</style>
