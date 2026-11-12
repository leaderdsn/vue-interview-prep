import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFeedbackStore } from '../model/feedbackStore'

import SelectionFeedback from './SelectionFeedback.vue'

import type * as SharedLib from '@/shared/lib'

vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedLib>()),
  isFirebaseConfigured: () => true,
}))

const context = { levelId: 'vue-junior', step: 2, topicTitle: 'Компоненты' }

/** Статья темы в документе и подменённое выделение внутри неё (jsdom не считает размеры Range). */
function setup(text: string | null) {
  const target = document.createElement('article')
  target.innerHTML = '<p>Компонетн — это кирпичик интерфейса</p>'
  document.body.append(target)
  const node = target.querySelector('p')!.firstChild
  vi.spyOn(document, 'getSelection').mockReturnValue({
    isCollapsed: text === null,
    rangeCount: text === null ? 0 : 1,
    anchorNode: node,
    focusNode: node,
    toString: () => text ?? '',
    getRangeAt: () => ({ getBoundingClientRect: () => ({ top: 100, bottom: 120, left: 50, width: 80 }) }),
  } as unknown as Selection)
  const wrapper = mount(SelectionFeedback, { props: { target, context }, attachTo: document.body })
  return { wrapper, target }
}

describe('SelectionFeedback', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    setActivePinia(createPinia())
  })

  it('без выделения кнопки нет', async () => {
    const { wrapper } = setup(null)

    wrapper.vm.update()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('показывает кнопку у выделения и открывает форму с цитатой', async () => {
    const { wrapper } = setup('Компонетн')
    const feedback = useFeedbackStore()

    wrapper.vm.update()
    await wrapper.vm.$nextTick()
    const button = wrapper.get('button')

    expect(button.text()).toContain('Сообщить об ошибке')
    expect(button.attributes('style')).toContain('top: 128px')

    await button.trigger('pointerdown')
    await button.trigger('click')

    expect(feedback.visible).toBe(true)
    expect(feedback.request).toMatchObject({ kind: 'typo', context: { ...context, quote: 'Компонетн' } })
    wrapper.unmount()
  })

  it('нажатие мышью не снимает выделение', async () => {
    const { wrapper } = setup('Компонетн')
    wrapper.vm.update()
    await wrapper.vm.$nextTick()

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.get('button').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('открывает форму по Ctrl+Enter, только если выделение в статье', () => {
    const { wrapper } = setup('Компонетн')
    const feedback = useFeedbackStore()

    const plain = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    document.dispatchEvent(plain)
    expect(feedback.visible).toBe(false)

    const shortcut = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(shortcut)

    expect(shortcut.defaultPrevented).toBe(true)
    expect(feedback.request?.context.quote).toBe('Компонетн')
    wrapper.unmount()
  })
})
