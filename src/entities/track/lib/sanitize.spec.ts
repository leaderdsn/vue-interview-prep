import { describe, expect, it } from 'vitest'

import { fetchBundledLevel, TRACKS } from '../api/trackApi'

import { sanitizeTopicHtml } from './sanitize'

describe('sanitizeTopicHtml', () => {
  it('не меняет ни одну тему из сборки', async () => {
    const levels = await Promise.all(TRACKS.flatMap((track) => track.levels.map((level) => fetchBundledLevel(level.id))))

    for (const level of levels) {
      for (const topic of level.topics) {
        expect(sanitizeTopicHtml(topic.html), `${level.id}: ${topic.title}`).toBe(topic.html)
      }
    }
  })

  it.each([
    ['script', '<p>a</p><script>alert(1)</script>', '<p>a</p>'],
    ['обработчики on*', '<p onclick="alert(1)">a</p>', '<p>a</p>'],
    ['img с onerror', '<p>a<img src="x" onerror="alert(1)"></p>', '<p>a</p>'],
    ['iframe', '<iframe src="https://evil.example"></iframe><p>a</p>', '<p>a</p>'],
    ['javascript: в ссылке', '<a href="javascript:alert(1)">a</a>', '<a>a</a>'],
    ['javascript: с переводом строки', '<a href="java\nscript:alert(1)">a</a>', '<a>a</a>'],
    ['data: в ссылке', '<a href="data:text/html,<b>">a</a>', '<a>a</a>'],
    ['ссылку на чужой протокол без схемы', '<a href="//evil.example">a</a>', '<a>a</a>'],
    ['style с произвольным значением', '<figure class="figure" style="background:url(x)">a</figure>', '<figure class="figure">a</figure>'],
    ['style у других тегов', '<p style="margin:0">a</p>', '<p>a</p>'],
    ['неизвестные классы', '<div class="note evil">a</div>', '<div class="note">a</div>'],
    ['чужой target', '<a href="/x" target="evil">a</a>', '<a href="/x">a</a>'],
    ['комментарии', '<p>a<!-- секрет --></p>', '<p>a</p>'],
    ['svg', '<svg><script>alert(1)</script></svg><p>a</p>', '<p>a</p>'],
  ])('удаляет %s', (_, input, expected) => {
    expect(sanitizeTopicHtml(input)).toBe(expected)
  })

  it('разворачивает неизвестные теги, оставляя текст', () => {
    expect(sanitizeTopicHtml('<p><em>важно</em> и <u>так</u></p>')).toBe('<p>важно и так</p>')
  })

  it('оставляет безопасные ссылки', () => {
    const html =
      '<p><a href="https://vuejs.org" target="_blank" rel="noopener">a</a> <a href="/level/vue-junior/1/">b</a> <a href="#x">c</a></p>'

    expect(sanitizeTopicHtml(html)).toBe(html)
  })

  it('оставляет классы контента и объединённые ячейки', () => {
    const html =
      '<div class="table-wrap"><table><tbody><tr><td colspan="2"><code>x</code></td></tr></tbody></table></div><div class="flow"><div class="step hl"><b>a</b></div><div class="arrow" aria-hidden="true">→</div></div>'

    expect(sanitizeTopicHtml(html)).toBe(html)
  })
})
