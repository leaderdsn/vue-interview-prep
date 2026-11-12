import { beforeAll, describe, expect, it } from 'vitest'

import { fetchBundledLevel, TRACKS } from '@/entities/track'

import {
  createBlock,
  duplicateBlock,
  highlightCode,
  moveBlock,
  parseBlocks,
  patchBlock,
  renderBlock,
  serializeBlocks,
} from './blocks'

import type { Block } from './blocks'
import type { Level } from '@/entities/track'

const levelIds = TRACKS.flatMap((track) => track.levels.map((level) => level.id))
const levels: Level[] = []

beforeAll(async () => {
  levels.push(...(await Promise.all(levelIds.map(fetchBundledLevel))))
})

/** Первый блок нужного типа из разобранного HTML. */
function only<T extends Block['type']>(html: string, type: T): Extract<Block, { type: T }> {
  const [block] = parseBlocks(html)
  expect(block?.type).toBe(type)
  return block as Extract<Block, { type: T }>
}

describe('parseBlocks и serializeBlocks', () => {
  // Проходит по всем темам всех уровней: при параллельном прогоне всего набора не укладывается в 5 секунд по умолчанию.
  it('без правок возвращают исходный HTML каждой темы каждого уровня', { timeout: 30_000 }, () => {
    expect(levels).toHaveLength(levelIds.length)
    for (const level of levels) {
      for (const topic of level.topics) {
        expect(serializeBlocks(parseBlocks(topic.html)), `${level.id}: ${topic.title}`).toBe(topic.html)
      }
    }
  })

  it('распознаёт в контенте блоки форм, а не только HTML', () => {
    const types = new Set(levels.flatMap((level) => level.topics.flatMap((topic) => parseBlocks(topic.html).map((b) => b.type))))

    expect([...types].sort()).toEqual(['code', 'heading', 'html', 'list', 'note', 'paragraph', 'say', 'table', 'warn'])
  })

  it('после правки блока собирает его HTML из полей и не трогает соседей', () => {
    const html = '\n<h3>Заголовок</h3>\n<p>Текст с <code>a > b</code></p>\n'
    const blocks = parseBlocks(html)
    const edited = blocks.map((block) => (block.type === 'paragraph' ? patchBlock(block, { html: 'Новый текст' }) : block))

    expect(serializeBlocks(edited)).toBe('\n<h3>Заголовок</h3>\n<p>Новый текст</p>\n')
  })

  it('объединяет подпись файла и код в один блок', () => {
    const block = only('<div class="code-label">a.ts</div><pre class="code">const a = 1 <span class="c">// один</span></pre>', 'code')

    expect(block.label).toBe('a.ts')
    expect(block.code).toBe('const a = 1 // один')
  })

  it('уносит в блок HTML то, что форма не передаст без потерь', () => {
    expect(only('<p class="lead">x</p>', 'html').html).toBe('<p class="lead">x</p>')
    expect(only('<pre class="code"><b>x</b></pre>', 'html').type).toBe('html')
    expect(only('<figure class="figure"><div class="flow"></div></figure>', 'html').type).toBe('html')
    expect(
      only('<div class="table-wrap"><table><thead><tr><th>a</th></tr></thead><tbody><tr><td colspan="2">b</td></tr></tbody></table></div>', 'html').type,
    ).toBe('html')
  })

  it('не теряет текст верхнего уровня и комментарии', () => {
    const html = 'Текст <b>жирный</b><!-- заметка -->'

    expect(serializeBlocks(parseBlocks(html))).toBe(html)
  })

  it('нормализует некорректный HTML, но не теряет содержимое', () => {
    const blocks = parseBlocks('<p>без закрытия')

    expect(serializeBlocks(blocks)).toBe('<p>без закрытия</p>')
  })
})

describe('renderBlock', () => {
  const fresh = <T extends Block['type']>(type: T, fields: Partial<Extract<Block, { type: T }>>) =>
    ({ ...createBlock(type), ...fields }) as Block

  it.each<[string, Block, string]>([
    ['подзаголовок', fresh('heading', { html: 'Тема' }), '<h3>Тема</h3>'],
    ['абзац', fresh('paragraph', { html: 'Текст <b>жирно</b>' }), '<p>Текст <b>жирно</b></p>'],
    ['маркированный список', fresh('list', { items: ['а', 'б'] }), '<ul><li>а</li><li>б</li></ul>'],
    ['нумерованный список', fresh('list', { ordered: true, items: ['а'] }), '<ol><li>а</li></ol>'],
    ['заметку', fresh('note', { html: 'Важно' }), '<div class="note">Важно</div>'],
    ['ловушку', fresh('warn', { html: 'Осторожно' }), '<div class="note warn">Осторожно</div>'],
    [
      'фразу для собеседования',
      fresh('say', { html: '«Ответ»' }),
      '<div class="say"><span class="eyebrow">Как сказать на собеседовании</span>«Ответ»</div>',
    ],
    [
      'таблицу',
      fresh('table', { head: ['A', 'B'], rows: [['1', '<code>2</code>']] }),
      '<div class="table-wrap"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><code>2</code></td></tr></tbody></table></div>',
    ],
    ['код с подписью', fresh('code', { label: 'a.ts', code: 'a < b' }), '<div class="code-label">a.ts</div><pre class="code">a &lt; b</pre>'],
    ['код без подписи', fresh('code', { code: 'x' }), '<pre class="code">x</pre>'],
    ['HTML как есть', fresh('html', { html: '<figure class="figure"></figure>' }), '<figure class="figure"></figure>'],
  ])('собирает %s', (_, block, html) => {
    expect(renderBlock(block)).toBe(html)
  })

  it('разбор собранного блока даёт те же поля', () => {
    const table = fresh('table', { head: ['A', 'B'], rows: [['1', '2']] })
    const [parsed] = parseBlocks(renderBlock(table))

    expect(parsed).toMatchObject({ type: 'table', head: ['A', 'B'], rows: [['1', '2']] })
  })

  it('сохраняет ведущий перевод строки в коде', () => {
    const block = fresh('code', { code: '\nx' })
    const [parsed] = parseBlocks(renderBlock(block))

    expect(parsed).toMatchObject({ type: 'code', code: '\nx' })
  })

  it('при перемещении блоков пробелы между ними остаются на своих местах', () => {
    const blocks = parseBlocks('<h3>a</h3><p>b</p>\n<p>c</p>\n')

    expect(serializeBlocks(moveBlock(blocks, 2, 0))).toBe('<p>c</p><h3>a</h3>\n<p>b</p>\n')
    expect(serializeBlocks(moveBlock(blocks, 0, 5))).toBe('<h3>a</h3><p>b</p>\n<p>c</p>\n')
  })

  it('копия блока получает новый ключ', () => {
    const block = createBlock('paragraph')

    expect(duplicateBlock(block)).toEqual({ ...block, id: expect.not.stringMatching(block.id) })
  })
})

describe('highlightCode', () => {
  it('экранирует код и выделяет комментарии', () => {
    expect(highlightCode('const a = b && c < d // сравнение\n// целая строка')).toBe(
      'const a = b &amp;&amp; c &lt; d <span class="c">// сравнение</span>\n<span class="c">// целая строка</span>',
    )
  })

  it('не считает комментарием адрес с //', () => {
    expect(highlightCode("fetch('https://api.example.com')")).toBe("fetch('https://api.example.com')")
  })

  it('выделяет # в начале строки с отступом и после пробела', () => {
    expect(highlightCode('  # установка\nsrc/   # исходники\n#!/bin/sh')).toBe(
      '  <span class="c"># установка</span>\nsrc/   <span class="c"># исходники</span>\n<span class="c">#!/bin/sh</span>',
    )
  })

  it('не считает комментарием приватные поля, цвета и слоты', () => {
    const code = '  #count = 0\ncolor: #fff;\n<template #header>'

    expect(highlightCode(code)).toBe(code.replace('<', '&lt;').replace('>', '&gt;'))
  })

  it('экранирует HTML внутри комментария', () => {
    expect(highlightCode('// <b>')).toBe('<span class="c">// &lt;b&gt;</span>')
  })
})
