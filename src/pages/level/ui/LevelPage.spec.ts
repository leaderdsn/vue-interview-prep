import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useProgressStore } from '@/entities/progress'
import { fetchLevel, findLevel } from '@/entities/track'

import LevelPage from './LevelPage.vue'

import type { Level } from '@/entities/track'
import type * as TrackModule from '@/entities/track'

// Уровень «загружается» из теста: так видно, что страница берёт число тем из загруженного уровня, а не из индекса.
vi.mock('@/entities/track', async (importOriginal) => ({
  ...(await importOriginal<typeof TrackModule>()),
  fetchLevel: vi.fn(),
}))

const LEVEL_ID = 'vue-junior'
const indexTitles = findLevel(LEVEL_ID)?.level.topicTitles ?? []

function levelWith(count: number): Level {
  return {
    id: LEVEL_ID,
    trackId: 'vue',
    level: 'junior',
    topics: Array.from({ length: count }, (_, index) => ({ title: `Тема из базы ${index + 1}`, html: `<p>Текст ${index + 1}</p>` })),
    quiz: [{ topic: 0, type: 'theory', question: 'Вопрос?', options: ['а', 'б', 'в', 'г'], answer: 0, explanation: 'Так.' }],
  }
}

async function mountPage(step: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/level/:levelId/:step?', name: 'level', component: LevelPage, props: true },
    ],
  })
  await router.push(`/level/${LEVEL_ID}/${step}`)
  const wrapper = mount(LevelPage, { props: { levelId: LEVEL_ID, step }, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const railTitles = (wrapper: Awaited<ReturnType<typeof mountPage>>) =>
  wrapper.findAll('.rail-step__title').map((item) => item.text())

describe('LevelPage', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('показывает «Тема не найдена» со ссылками, если в загруженном уровне меньше тем', async () => {
    vi.mocked(fetchLevel).mockResolvedValue(levelWith(2))

    const wrapper = await mountPage('3')

    expect(wrapper.find('.lesson__title').text()).toBe('Тема не найдена')
    const links = wrapper.findAll('.lesson__link')
    expect(links.map((link) => link.text())).toEqual(['К первой теме уровня', 'На главную'])
    expect(links[0]?.attributes('href')).toBe(`/level/${LEVEL_ID}/1`)
    expect(links[1]?.attributes('href')).toBe('/')
    // Навигация и прогресс — по загруженному уровню; несуществующая тема не отмечается прочитанной.
    expect(railTitles(wrapper)).toEqual(['Тема из базы 1', 'Тема из базы 2', 'Тест'])
    expect(wrapper.text()).toContain('Прочитано тем: 0 из 2')
    expect(useProgressStore().getLevel(LEVEL_ID).seenTopics).toEqual([])
  })

  it('показывает тему сверх индекса, если её добавили правкой, и ведёт с последней темы к тесту', async () => {
    const count = indexTitles.length + 1
    vi.mocked(fetchLevel).mockResolvedValue(levelWith(count))

    const wrapper = await mountPage(String(count))

    expect(wrapper.find('.lesson__title').text()).toBe(`${count}. Тема из базы ${count}`)
    expect(railTitles(wrapper)).toHaveLength(count + 1)
    expect(wrapper.findAll('.lesson__nav button').map((item) => item.text())).toEqual(['Назад', 'К тесту'])
    expect(wrapper.text()).toContain(`Прочитано тем: 1 из ${count}`)
    expect(useProgressStore().getLevel(LEVEL_ID).seenTopics).toEqual([count - 1])
  })

  it('на предпоследней теме из индекса ведёт «Дальше», если в уровне тем больше', async () => {
    vi.mocked(fetchLevel).mockResolvedValue(levelWith(indexTitles.length + 1))

    const wrapper = await mountPage(String(indexTitles.length))

    expect(wrapper.findAll('.lesson__nav button').map((item) => item.text())).toContain('Дальше')
  })

  it('пока уровень грузится, берёт заголовки тем из индекса', async () => {
    vi.mocked(fetchLevel).mockReturnValue(new Promise(() => {}))

    const wrapper = await mountPage('1')

    expect(railTitles(wrapper)).toEqual([...indexTitles, 'Тест'])
    expect(wrapper.text()).not.toContain('Тема не найдена')
  })
})
