import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useProgressStore } from '@/entities/progress'

import TrackGrid from './TrackGrid.vue'

import type { Track } from '@/entities/track'

const TOPICS = ['a', 'b', 'c', 'd']

const TRACKS: Track[] = [
  {
    id: 'vue',
    title: 'Vue',
    description: 'Фреймворк',
    levels: [
      { id: 'vue-junior', level: 'junior', description: 'Основы', topicTitles: TOPICS, quizCount: 12 },
      { id: 'vue-middle', level: 'middle', description: 'Глубже', topicTitles: TOPICS, quizCount: 12 },
      { id: 'vue-senior', level: 'senior', description: 'Архитектура', topicTitles: TOPICS, quizCount: 12 },
    ],
  },
]

async function mountGrid() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/level/:levelId/:step?', name: 'level', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  return mount(TrackGrid, { props: { tracks: TRACKS }, global: { plugins: [router] } })
}

describe('TrackGrid', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('показывает три уровня трека со ссылками', async () => {
    const wrapper = await mountGrid()

    expect(wrapper.findAll('.level-link')).toHaveLength(3)
    expect(wrapper.get('[data-level="vue-middle"]').attributes('href')).toBe('/level/vue-middle')
  })

  it('показывает прочитанные темы без плашки результата', async () => {
    const progress = useProgressStore()
    progress.markTopicSeen('vue-junior', 0)
    progress.markTopicSeen('vue-junior', 1)
    const wrapper = await mountGrid()

    const link = wrapper.get('[data-level="vue-junior"]')
    expect(link.text()).toContain('2/4')
    expect(link.find('.score-pill').exists()).toBe(false)
  })

  it('отмечает зелёной плашкой результат от 80%', async () => {
    useProgressStore().recordQuizResult('vue-junior', 90)
    const wrapper = await mountGrid()

    const pill = wrapper.get('[data-level="vue-junior"] .score-pill')
    expect(pill.classes()).toContain('score-pill--good')
    expect(pill.text()).toContain('90%')
  })

  it('отмечает красной плашкой результат ниже 60%', async () => {
    useProgressStore().recordQuizResult('vue-middle', 40)
    const wrapper = await mountGrid()

    expect(wrapper.get('[data-level="vue-middle"] .score-pill').classes()).toContain('score-pill--bad')
  })
})
