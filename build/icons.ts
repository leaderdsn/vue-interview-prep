// Генерирует растровые иконки и картинку для соцсетей из public/favicon.svg.
// Запуск: pnpm icons (нужен установленный Chrome или Chromium; путь можно задать в CHROME_PATH).
// Результат коммитится в public/, при сборке скрипт не выполняется.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = new URL('..', import.meta.url)
const publicDir = new URL('public/', root)

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path): path is string => Boolean(path && existsSync(path)))
  if (!found) throw new Error('icons: Chrome не найден, укажите путь в CHROME_PATH')
  return found
}

/** Иконка без скруглений: для apple-touch-icon и maskable, система сама обрезает углы. */
function fullBleed(svg: string): string {
  return svg.replace(/\s*rx="\d+"/, '')
}

/** Страница, которая показывает SVG ровно на весь кадр. */
function iconPage(svg: string): string {
  return `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style></head><body>${svg}</body></html>`
}

/** Картинка для ссылок в соцсетях и мессенджерах, 1200×630. */
function ogPage(svg: string, title: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1200px;height:630px}
    body{display:flex;flex-direction:column;justify-content:center;gap:28px;padding:0 96px;box-sizing:border-box;
      background:linear-gradient(135deg,#022c22 0%,#064e3b 55%,#047857 100%);color:#fff;
      font-family:'Segoe UI',Inter,'Helvetica Neue',Arial,sans-serif}
    svg{width:132px;height:132px}
    h1{margin:0;font-size:76px;line-height:1.05;font-weight:700;letter-spacing:-1px}
    p{margin:0;font-size:34px;line-height:1.35;color:#a7f3d0;max-width:960px}
    .tags{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}
    .tags span{padding:8px 20px;border-radius:999px;background:rgba(255,255,255,.12);font-size:24px;color:#ecfdf5}
  </style></head><body>
    ${svg}
    <h1>${title}</h1>
    <p>Тренажёр собеседования по фронтенду: темы по уровням Junior, Middle, Senior и тесты</p>
    <div class="tags"><span>Vue</span><span>React</span><span>Angular</span><span>JavaScript</span><span>TypeScript</span><span>Алгоритмы</span></div>
  </body></html>`
}

/** ICO с одним PNG внутри: так его понимают все браузеры с Vista и новее. */
function pngToIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0) // зарезервировано
  header.writeUInt16LE(1, 2) // тип: иконка
  header.writeUInt16LE(1, 4) // количество изображений
  header.writeUInt8(size >= 256 ? 0 : size, 6)
  header.writeUInt8(size >= 256 ? 0 : size, 7)
  header.writeUInt8(0, 8) // палитра не используется
  header.writeUInt8(0, 9)
  header.writeUInt16LE(1, 10) // цветовые плоскости
  header.writeUInt16LE(32, 12) // бит на пиксель
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18) // смещение данных
  return Buffer.concat([header, png])
}

async function readTitle(): Promise<string> {
  const env = await readFile(new URL('.env', root), 'utf-8').catch(() => '')
  return /^VITE_APP_TITLE=(.+)$/m.exec(env)?.[1]?.trim() || 'Frontend подготовка'
}

async function main() {
  const chrome = findChrome()
  const svg = await readFile(new URL('favicon.svg', publicDir), 'utf-8')
  const title = await readTitle()
  const work = await mkdtemp(join(tmpdir(), 'app-icons-'))

  // Headless Chrome не открывает окно уже ~500 px, поэтому маленькие иконки рисуются в кадре 512×512
  // и уменьшаются масштабом устройства.
  const shoot = async (name: string, html: string, width: number, height: number, scale = 1): Promise<Buffer> => {
    const page = join(work, `${name}.html`)
    const out = join(work, `${name}.png`)
    await writeFile(page, html)
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=${scale}`,
      '--default-background-color=00000000',
      `--window-size=${width},${height}`,
      `--screenshot=${out}`,
      pathToFileURL(page).href,
    ], { stdio: 'ignore' })
    return readFile(out)
  }

  try {
    const outputs: [string, Buffer][] = [
      ['favicon.ico', pngToIco(await shoot('favicon-32', iconPage(svg), 512, 512, 32 / 512), 32)],
      ['apple-touch-icon.png', await shoot('apple', iconPage(fullBleed(svg)), 512, 512, 180 / 512)],
      ['icon-192.png', await shoot('icon-192', iconPage(svg), 512, 512, 192 / 512)],
      ['icon-512.png', await shoot('icon-512', iconPage(svg), 512, 512)],
      ['icon-maskable-512.png', await shoot('maskable', iconPage(fullBleed(svg)), 512, 512)],
      ['og-image.png', await shoot('og', ogPage(svg, title), 1200, 630)],
    ]
    for (const [name, data] of outputs) {
      await writeFile(new URL(name, publicDir), data)
      process.stdout.write(`icons: public/${name} (${Math.round(data.length / 1024)} КБ)\n`)
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

await main()
