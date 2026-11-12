import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useProgressStore } from '@/entities/progress'

import QuizRunner from './QuizRunner.vue'

import type { Level } from '@/entities/track'

const LEVEL: Level = {
  id: 'vue-junior',
  trackId: 'vue',
  level: 'junior',
  topics: [
    { title: 'Первая', html: '<p>1</p>' },
    { title: 'Вторая', html: '<p>2</p>' },
  ],
  quiz: [
    { topic: 0, type: 'theory', question: 'Первый?', options: ['да', 'нет'], answer: 0, explanation: 'Потому что да' },
    { topic: 1, type: 'practice', question: 'Второй?', code: 'const a = 1', options: ['x', 'y', 'z'], answer: 2, explanation: 'Потому что z' },
  ],
}

function mountRunner() {
  return mount(QuizRunner, { props: { level: LEVEL } })
}

function pick(wrapper: ReturnType<typeof mountRunner>, question: string, optionText: string) {
  const fieldset = wrapper.findAll('fieldset').find((item) => item.text().includes(question))
  const option = fieldset?.findAll('label').find((label) => label.text().includes(optionText))
  return option!.get('input').setValue(true)
}

function button(wrapper: ReturnType<typeof mountRunner>, label: string) {
  return wrapper.findAll('button').find((item) => item.text() === label)!
}

describe('QuizRunner', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('показывает все вопросы с тегами и кодом', () => {
    const wrapper = mountRunner()

    expect(wrapper.findAll('fieldset')).toHaveLength(2)
    expect(wrapper.text()).toContain('Теория')
    expect(wrapper.text()).toContain('Практика')
    expect(wrapper.find('pre').text()).toBe('const a = 1')
  })

  it('предупреждает о вопросах без ответа и проверяет со второго нажатия', async () => {
    const wrapper = mountRunner()
    await pick(wrapper, 'Первый?', 'да')

    await button(wrapper, 'Проверить').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('1')
    expect(wrapper.find('.quiz-result').exists()).toBe(false)

    await button(wrapper, 'Проверить').trigger('click')
    expect(wrapper.find('.quiz-result').exists()).toBe(true)
  })

  it('считает результат, подсвечивает ответы и сохраняет прогресс', async () => {
    const wrapper = mountRunner()
    await pick(wrapper, 'Первый?', 'да')
    await pick(wrapper, 'Второй?', 'x')

    await button(wrapper, 'Проверить').trigger('click')

    const result = wrapper.get('.quiz-result')
    expect(result.text()).toContain('50%')
    expect(result.text()).toContain('Теория: 1/1')
    expect(result.text()).toContain('Практика: 0/1')
    expect(wrapper.findAll('.option.right')).toHaveLength(2)
    expect(wrapper.findAll('.option.wrong')).toHaveLength(1)
    expect(wrapper.text()).toContain('Потому что z')
    expect(useProgressStore().getLevel('vue-junior')).toMatchObject({ lastScore: 50, attempts: 1 })
  })

  it('отдаёт номер темы для «Перечитать тему»', async () => {
    const wrapper = mountRunner()
    await pick(wrapper, 'Первый?', 'да')
    await pick(wrapper, 'Второй?', 'z')
    await button(wrapper, 'Проверить').trigger('click')

    await wrapper.findAll('.question__review')[1]?.trigger('click')

    expect(wrapper.emitted('review-topic')).toHaveLength(1)
    expect(wrapper.emitted('review-topic')?.[0]?.[0]).toBeTypeOf('number')
  })

  it('после проверки показывает действия страницы у каждого вопроса с его индексом в тесте', async () => {
    const wrapper = mount(QuizRunner, {
      props: { level: LEVEL },
      slots: { 'question-actions': '<template #question-actions="{ questionIndex }"><span class="action">#{{ questionIndex }}</span></template>' },
    })
    expect(wrapper.find('.action').exists()).toBe(false)

    await pick(wrapper, 'Первый?', 'да')
    await pick(wrapper, 'Второй?', 'z')
    await button(wrapper, 'Проверить').trigger('click')

    expect(wrapper.findAll('.action').map((item) => item.text()).sort()).toEqual(['#0', '#1'])
  })

  it('«Пройти заново» очищает ответы и результат', async () => {
    const wrapper = mountRunner()
    await pick(wrapper, 'Первый?', 'да')
    await pick(wrapper, 'Второй?', 'z')
    await button(wrapper, 'Проверить').trigger('click')

    await wrapper.findAll('button').find((item) => item.text() === 'Пройти заново')!.trigger('click')

    expect(wrapper.find('.quiz-result').exists()).toBe(false)
    expect(wrapper.findAll('input:checked')).toHaveLength(0)
    expect(wrapper.findAll('fieldset')).toHaveLength(2)
  })
})
