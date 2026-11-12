import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { finalizeTopics } from '../model/topicDraft'

import ContentEditor from './ContentEditor.vue'

import type { EditorFocus } from '../model/focus'
import type { LevelDraft } from '../model/levelDraft'
import type { Level, QuizQuestion } from '@/entities/track'
import type * as SharedLib from '@/shared/lib'

// В тестах SDK не загружается: сохранение здесь не проверяется (см. adminStore.spec.ts и levelDraft.spec.ts).
vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedLib>()),
  loadFirebase: () => new Promise(() => {}),
}))

const question = (topic: number, text: string): QuizQuestion => ({
  topic,
  type: 'theory',
  question: text,
  options: ['а', 'б', 'в', 'г'],
  answer: 0,
  explanation: 'Так.',
})

const level: Level = {
  id: 'vue-junior',
  trackId: 'vue',
  level: 'junior',
  topics: [
    { title: 'Первая', html: '<h3>Раздел</h3>\n<p>Текст</p>' },
    { title: 'Вторая', html: '<p>Другая тема</p>' },
  ],
  quiz: [question(0, 'К первой?'), question(1, 'Ко второй?')],
}

function mountEditor(props: { level?: Level; focus?: EditorFocus | null } = {}) {
  return mount(ContentEditor, { props: { level, override: null, ...props } })
}

type Wrapper = ReturnType<typeof mountEditor>

const draftOf = (wrapper: Wrapper) => (wrapper.vm as unknown as { draft: LevelDraft }).draft
const html = (wrapper: Wrapper, index = 0) => finalizeTopics(draftOf(wrapper).topics)[index]?.html
const topicsOf = (wrapper: Wrapper) => draftOf(wrapper).topics.map((topic) => topic.title)
const quizTopics = (wrapper: Wrapper) => draftOf(wrapper).quiz.map((item) => item.topic)

const button = (wrapper: Wrapper, label: string) => {
  const found = wrapper.findAll('button').filter((item) => item.attributes('aria-label') === label || item.text() === label)
  const last = found[found.length - 1]
  if (!last) throw new Error(`Нет кнопки «${label}»`)
  return last
}
const saveButton = (wrapper: Wrapper) => button(wrapper, 'Сохранить для всех')

describe('ContentEditor: темы', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Select из PrimeVue подписывается на ориентацию экрана, а в jsdom нет matchMedia.
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    // Textarea с auto-resize следит за размером через ResizeObserver, которого тоже нет в jsdom.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  it('показывает блоки темы с предпросмотром, без правок сохранять нечего', () => {
    const wrapper = mountEditor()

    expect(wrapper.findAll('.block-card')).toHaveLength(2)
    expect(wrapper.find('.block-card__preview h3').text()).toBe('Раздел')
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('добавляет абзац в конец, правит его, переставляет и удаляет', async () => {
    const wrapper = mountEditor()

    await button(wrapper, 'Добавить блок').trigger('click')
    await button(wrapper, 'Абзац').trigger('click')

    expect(wrapper.findAll('.block-card')).toHaveLength(3)
    // Пустой блок не даёт сохранить.
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()

    const textareas = wrapper.findAll('.block-card')[2]?.findAll('textarea') ?? []
    await textareas[0]?.setValue('Новый <b>абзац</b>')

    expect(html(wrapper)).toBe('<h3>Раздел</h3>\n<p>Текст</p>\n<p>Новый <b>абзац</b></p>')
    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()

    await button(wrapper, 'Поднять блок 3').trigger('click')

    expect(html(wrapper)).toBe('<h3>Раздел</h3>\n<p>Новый <b>абзац</b></p>\n<p>Текст</p>')

    await button(wrapper, 'Удалить блок 2').trigger('click')

    expect(html(wrapper)).toBe('<h3>Раздел</h3>\n<p>Текст</p>')
    // Вернулись к исходному HTML — изменений нет.
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('дублирует блок и правит заголовок темы', async () => {
    const wrapper = mountEditor()

    await button(wrapper, 'Дублировать блок 1').trigger('click')
    await wrapper.find('input').setValue('Первая, исправленная')

    expect(html(wrapper)).toBe('<h3>Раздел</h3>\n<h3>Раздел</h3>\n<p>Текст</p>')
    expect(topicsOf(wrapper)[0]).toBe('Первая, исправленная')
    // Заголовок и блоки — не структура: тест вместе с темами сохранять не нужно.
    expect(draftOf(wrapper).structureChanged).toBe(false)
  })

  it('оборачивает выделенный текст в <code>', async () => {
    const wrapper = mountEditor()
    const textarea = wrapper.findAll('.block-card')[1]?.find('textarea')
    const element = textarea?.element as HTMLTextAreaElement
    element.setSelectionRange(0, 5)

    await button(wrapper, 'Код: Абзац').trigger('click')
    await flushPromises()

    expect(html(wrapper)).toBe('<h3>Раздел</h3>\n<p><code>Текст</code></p>')
  })

  it('отменяет изменения', async () => {
    const wrapper = mountEditor()

    await button(wrapper, 'Удалить блок 1').trigger('click')
    await button(wrapper, 'Отменить изменения').trigger('click')

    expect(html(wrapper)).toBe(level.topics[0]?.html)
  })

  it('«Новая тема» добавляет тему с пустым абзацем и выбирает её; сохранить можно после заполнения', async () => {
    const wrapper = mountEditor()

    await button(wrapper, 'Новая тема').trigger('click')

    expect(topicsOf(wrapper)).toEqual(['Первая', 'Вторая', 'Новая тема'])
    // Выбрана новая тема: в поле заголовка её название, блок один — пустой абзац.
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Новая тема')
    expect(wrapper.findAll('.block-card')).toHaveLength(1)
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('сохранит темы и тест вместе')
    expect(wrapper.text()).toContain('Чтобы новая тема появилась на главной и в поиске, положите оба файла в репозиторий')

    await wrapper.findAll('.block-card')[0]?.find('textarea').setValue('Текст новой темы')

    expect(html(wrapper, 2)).toBe('<p>Текст новой темы</p>')
    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()
    // Вопросы ссылаются на те же темы.
    expect(quizTopics(wrapper)).toEqual([0, 1])
  })

  it('переставляет темы, и вопросы теста следуют за своими темами', async () => {
    const wrapper = mountEditor()

    expect(button(wrapper, 'Поднять тему').attributes('disabled')).toBeDefined()

    await button(wrapper, 'Опустить тему').trigger('click')

    expect(topicsOf(wrapper)).toEqual(['Вторая', 'Первая'])
    expect(quizTopics(wrapper)).toEqual([1, 0])
    expect(draftOf(wrapper).structureChanged).toBe(true)
    // Выбранной осталась та же тема — теперь вторая.
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Первая')

    await button(wrapper, 'Поднять тему').trigger('click')

    expect(topicsOf(wrapper)).toEqual(['Первая', 'Вторая'])
    expect(quizTopics(wrapper)).toEqual([0, 1])
    expect(draftOf(wrapper).dirty).toBe(false)
  })

  it('удаляет тему после подтверждения на месте; вопросы к ней требуют выбрать другую тему', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const wrapper = mountEditor()

    await button(wrapper, 'Удалить тему').trigger('click')

    expect(wrapper.text()).toContain('Удалить тему 1?')
    expect(wrapper.text()).toContain('Вопросам теста по ней (1)')
    expect(topicsOf(wrapper)).toHaveLength(2)

    await button(wrapper, 'Да, удалить').trigger('click')

    expect(confirm).not.toHaveBeenCalled()
    expect(topicsOf(wrapper)).toEqual(['Вторая'])
    expect(quizTopics(wrapper)).toEqual([-1, 0])
    expect(draftOf(wrapper).topicsSaveIssues).toContain('Тест. Вопрос 1: тема удалена — выберите другую')
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    // Последнюю тему удалить нельзя.
    expect(button(wrapper, 'Удалить тему').attributes('disabled')).toBeDefined()

    // В тесте видно, что вопросу нужна новая тема, и сохранить тест тоже нельзя.
    // Номера тем в вопросах пересчитаны, поэтому тест тоже отмечен изменённым.
    await button(wrapper, 'Тест •').trigger('click')

    expect(wrapper.find('.quiz-editor__issues').text()).toContain('Вопрос 1: тема удалена — выберите другую')
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('отмена удаления темы на месте ничего не удаляет', async () => {
    const wrapper = mountEditor()

    await button(wrapper, 'Удалить тему').trigger('click')
    await button(wrapper, 'Отмена').trigger('click')

    expect(topicsOf(wrapper)).toEqual(['Первая', 'Вторая'])
    expect(wrapper.text()).not.toContain('Удалить тему 1?')
  })

  it('«Отменить изменения» у тем возвращает и темы, и номера тем в вопросах', async () => {
    const wrapper = mountEditor()

    await button(wrapper, 'Удалить тему').trigger('click')
    await button(wrapper, 'Да, удалить').trigger('click')
    await button(wrapper, 'Новая тема').trigger('click')

    expect(quizTopics(wrapper)).toEqual([-1, 0])

    await button(wrapper, 'Отменить изменения').trigger('click')

    expect(topicsOf(wrapper)).toEqual(['Первая', 'Вторая'])
    expect(quizTopics(wrapper)).toEqual([0, 1])
    expect(draftOf(wrapper).dirty).toBe(false)
  })

  it('предупреждает, если тема из замечания уже не существует', () => {
    const wrapper = mountEditor({ focus: { step: 5, key: 1 } })

    expect(wrapper.text()).toContain('Темы 5 в уровне нет (сейчас тем 2)')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Первая')
  })

  it('открывает тему из замечания, если она есть', () => {
    const wrapper = mountEditor({ focus: { step: 2, key: 1 } })

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Вторая')
    expect(wrapper.text()).not.toContain('в уровне нет')
  })

  it('предупреждает, если вопроса из замечания уже нет в тесте', () => {
    const wrapper = mountEditor({ focus: { step: 'quiz', questionIndex: 7, key: 1 } })

    expect(wrapper.text()).toContain('Вопроса 8 в тесте нет')
  })
})
