<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useAnalyticsStore } from '../model/analyticsStore'
import { change, PERIODS } from '../model/report'

import BarList from './BarList.vue'
import TrendChart from './TrendChart.vue'

import type { DayPoint, Period, Totals } from '../model/report'

const store = useAnalyticsStore()

// «Сейчас на сайте» обновляется раз в минуту, пока открыта вкладка статистики.
const REALTIME_INTERVAL = 60_000
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => void store.loadRealtime(), REALTIME_INTERVAL)
})
onBeforeUnmount(() => clearInterval(timer))

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** Отчёт за период пуст: скорее всего, данные ещё не обработаны или сбор не работает. */
const periodEmpty = computed(() => store.dashboard !== null && store.dashboard.current.views === 0)

const numberFormat = new Intl.NumberFormat('ru-RU')
const percentFormat = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 0 })

const periodOptions = PERIODS.map((days) => ({ value: days, label: `${days} дней` }))
const period = computed({
  get: () => store.period,
  set: (value: Period) => store.setPeriod(value),
})

type TrendMetric = 'views' | 'users' | 'sessions'
const trendOptions: { value: TrendMetric; label: string }[] = [
  { value: 'views', label: 'Просмотры' },
  { value: 'users', label: 'Пользователи' },
  { value: 'sessions', label: 'Сессии' },
]
const trendMetric = ref<TrendMetric>('views')
const trendLabel = computed(() => trendOptions.find((option) => option.value === trendMetric.value)?.label ?? '')
const trendPoints = computed(() =>
  (store.dashboard?.daily ?? []).map((point: DayPoint) => ({ date: point.date, value: point[trendMetric.value] })),
)

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return minutes ? `${minutes} мин ${rest} с` : `${rest} с`
}

type Tile = { key: keyof Totals; label: string; format: (value: number) => string }
const tiles: Tile[] = [
  { key: 'users', label: 'Пользователи', format: (v) => numberFormat.format(v) },
  { key: 'newUsers', label: 'Новые', format: (v) => numberFormat.format(v) },
  { key: 'sessions', label: 'Сессии', format: (v) => numberFormat.format(v) },
  { key: 'views', label: 'Просмотры', format: (v) => numberFormat.format(v) },
  { key: 'engagementRate', label: 'Вовлечённость', format: (v) => percentFormat.format(v) },
  { key: 'sessionSeconds', label: 'Средняя сессия', format: duration },
]

function delta(key: keyof Totals) {
  const data = store.dashboard
  return data ? change(data.current[key], data.previous[key]) : null
}

const organicSessions = computed(
  () => store.dashboard?.channels.find((item) => item.key === 'Organic Search')?.value ?? 0,
)
const organicShare = computed(() => {
  const sessions = store.dashboard?.current.sessions ?? 0
  return sessions ? percentFormat.format(organicSessions.value / sessions) : '—'
})

const gaLink = computed(() => `https://analytics.google.com/analytics/web/#/p${store.propertyId}/reports/intelligenthome`)
</script>

<template>
  <section class="report" aria-labelledby="report-title">
    <h2 id="report-title" class="visually-hidden">Статистика посещений</h2>

    <Message v-if="!store.configured" severity="info">
      Отчёты Google Analytics не настроены: задайте переменные <code>VITE_GA_PROPERTY_ID</code> и
      <code>VITE_GOOGLE_OAUTH_CLIENT_ID</code> (см. README, раздел «Статистика»).
    </Message>

    <div v-else-if="!store.token" class="report__connect">
      <p>
        Статистика берётся из Google Analytics. Войдите аккаунтом Google, у которого есть доступ к ресурсу GA, —
        доступ запрашивается только на чтение и хранится до закрытия вкладки.
      </p>
      <Button label="Подключить Google Analytics" icon="pi pi-chart-line" @click="store.connect()" />
      <Message v-if="store.error" severity="error" size="small">{{ store.error }}</Message>
    </div>

    <template v-else>
      <div class="report__toolbar">
        <SelectButton
          v-model="period"
          :options="periodOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-label="Период"
        />
        <span class="report__note">Сравнение — с предыдущими {{ store.period }} днями</span>
        <span class="report__spacer" />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          variant="text"
          size="small"
          :loading="store.loading"
          @click="store.refresh()"
        />
        <a class="report__link" :href="gaLink" target="_blank" rel="noopener noreferrer">
          Открыть в Google Analytics <i class="pi pi-external-link" aria-hidden="true" />
        </a>
        <Button label="Отключить" severity="secondary" variant="text" size="small" @click="store.disconnect()" />
      </div>

      <Message v-if="store.error" severity="error">{{ store.error }}</Message>

      <div v-if="store.loading && !store.dashboard" role="status" class="report__loading">
        <span class="visually-hidden">Загружаем статистику…</span>
        <Skeleton height="6rem" />
        <Skeleton height="14rem" />
      </div>

      <template v-else-if="store.dashboard">
        <article class="report__card report__card--wide">
          <header class="report__card-head">
            <h3>Сейчас на сайте</h3>
            <span v-if="store.realtimeAt" class="report__note">
              последние 30 минут · обновлено в {{ timeFormat.format(store.realtimeAt) }}
            </span>
          </header>
          <template v-if="store.realtime">
            <p class="report__live">
              <span class="report__live-value">{{ numberFormat.format(store.realtime.activeUsers) }}</span>
              {{ store.realtime.activeUsers === 1 ? 'пользователь' : 'пользователей' }}
            </p>
            <div class="report__grid">
              <div>
                <h4 class="report__subhead">Страницы</h4>
                <BarList :items="store.realtime.pages" metric="Пользователи" empty="За 30 минут визитов не было" />
              </div>
              <div>
                <h4 class="report__subhead">События</h4>
                <BarList :items="store.realtime.events" metric="События" empty="За 30 минут событий не было" />
              </div>
            </div>
          </template>
          <p v-else class="report__note">Не удалось загрузить данные реального времени.</p>
        </article>

        <Message v-if="periodEmpty" severity="info">
          <p class="report__hint-title">За период данных пока нет. Почему так бывает:</p>
          <ul class="report__hint-list">
            <li>
              Google Analytics обрабатывает отчёты с задержкой <b>до 24–48 часов</b>. Свежие визиты видны только в блоке
              «Сейчас на сайте» выше.
            </li>
            <li>
              Статистика собирается только после кнопки <b>«Разрешить»</b> в баннере cookies. Если баннер закрыли
              отказом, вернуть его можно ссылкой «Cookies» в подвале.
            </li>
            <li>Блокировщики рекламы (uBlock, AdGuard, Brave) не пускают запросы к Google Analytics.</li>
            <li>Страницы админки в статистику не попадают.</li>
          </ul>
        </Message>

        <ul class="report__tiles" :aria-busy="store.loading">
          <li v-for="tile in tiles" :key="tile.key" class="report__tile">
            <span class="report__tile-label">{{ tile.label }}</span>
            <span class="report__tile-value">{{ tile.format(store.dashboard.current[tile.key]) }}</span>
            <span v-if="delta(tile.key) !== null" class="report__tile-delta">
              <i
                class="pi"
                :class="delta(tile.key)! >= 0 ? 'pi-arrow-up-right' : 'pi-arrow-down-right'"
                aria-hidden="true"
              />
              {{ delta(tile.key)! > 0 ? '+' : '' }}{{ delta(tile.key) }}%
              <span class="visually-hidden">к прошлому периоду</span>
            </span>
            <span v-else class="report__tile-delta">нет данных для сравнения</span>
          </li>
        </ul>

        <article class="report__card report__card--wide">
          <header class="report__card-head">
            <h3>{{ trendLabel }} по дням</h3>
            <SelectButton
              v-model="trendMetric"
              :options="trendOptions"
              option-label="label"
              option-value="value"
              :allow-empty="false"
              size="small"
              aria-label="Показатель на графике"
            />
          </header>
          <TrendChart :points="trendPoints" :label="trendLabel" />
          <details class="report__table">
            <summary>Таблица по дням</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Дата</th>
                  <th scope="col">Пользователи</th>
                  <th scope="col">Сессии</th>
                  <th scope="col">Просмотры</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in [...store.dashboard.daily].reverse()" :key="day.date">
                  <th scope="row">{{ day.date }}</th>
                  <td>{{ numberFormat.format(day.users) }}</td>
                  <td>{{ numberFormat.format(day.sessions) }}</td>
                  <td>{{ numberFormat.format(day.views) }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </article>

        <div class="report__grid">
          <article class="report__card">
            <h3>Популярные страницы</h3>
            <BarList :items="store.dashboard.topPages" metric="Просмотры" />
          </article>

          <article class="report__card">
            <h3>Источники трафика</h3>
            <BarList :items="store.dashboard.channels" metric="Сессии" />
          </article>

          <article class="report__card">
            <h3>SEO: поисковые системы</h3>
            <p class="report__note">
              Из поиска — {{ numberFormat.format(organicSessions) }} сессий, {{ organicShare }} всего трафика.
            </p>
            <BarList :items="store.dashboard.searchEngines" metric="Сессии" empty="Переходов из поиска пока нет" />
          </article>

          <article class="report__card">
            <h3>SEO: страницы входа из поиска</h3>
            <BarList :items="store.dashboard.searchLandingPages" metric="Сессии" empty="Переходов из поиска пока нет" />
          </article>

          <article class="report__card">
            <h3>Устройства</h3>
            <BarList :items="store.dashboard.devices" metric="Пользователи" />
          </article>

          <article class="report__card">
            <h3>Страны</h3>
            <BarList :items="store.dashboard.countries" metric="Пользователи" />
          </article>

          <article class="report__card">
            <h3>Действия</h3>
            <dl class="report__events">
              <div>
                <dt>Пройдено тестов</dt>
                <dd>{{ numberFormat.format(store.dashboard.events.quizzes) }}</dd>
              </div>
              <div>
                <dt>Регистраций</dt>
                <dd>{{ numberFormat.format(store.dashboard.events.signUps) }}</dd>
              </div>
              <div>
                <dt>Входов</dt>
                <dd>{{ numberFormat.format(store.dashboard.events.logins) }}</dd>
              </div>
            </dl>
            <p class="report__note">Считаются только посетители, разрешившие статистику в баннере cookies.</p>
          </article>
        </div>
      </template>
    </template>
  </section>
</template>

<style lang="sass" scoped>
@use './AnalyticsReport'
</style>
