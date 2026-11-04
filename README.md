# Vue Interview Prep

Тренажёр подготовки к собеседованию Vue-разработчика: темы по направлениям и уровням, тесты с разбором ошибок, прогресс сохраняется.

## 1. Назначение

- **14 направлений**: JavaScript, TypeScript, Vue 3 и Composition API, Nuxt, принципы и паттерны, архитектура фронтенда, CSS, HTML и доступность, UX/UI, браузер и сеть, тестирование и инструменты, Git, AI для разработчика, алгоритмы.
- **3 уровня** в каждом: Junior — база, на которую нужно отвечать уверенно; Middle — как всё устроено внутри; Senior — архитектура и решения.
- **4 темы на уровень** с примерами кода, схемами и блоком «Как сказать на собеседовании».
- **Тест из 12 вопросов** (теория и практика) в конце уровня: варианты перемешиваются, после проверки — объяснения и ссылка на тему с ответом.
- **Прогресс** (просмотренные темы, лучший и последний результат теста, где остановились) хранится в браузере. После входа через Google он синхронизируется между устройствами через Firebase; без входа его можно выгрузить в JSON и загрузить на другом устройстве.

## 2. Стек

| Область | Технология | Версия | Почему |
|---|---|---|---|
| Фреймворк | Vue 3 (Composition API, `<script setup lang="ts">`) | 3.5 | Единый стиль компонентов, хорошая типизация |
| Сборка | Vite | 8 | Мгновенный dev-сервер и HMR, production-сборка на Rolldown |
| Язык | TypeScript (strict) | 6.0 | Ошибки ловятся до запуска; шаблоны проверяет `vue-tsc` |
| Стили | Sass, indented-синтаксис (`.sass`) | 1.106 | Короче SCSS, модули `@use` / `@forward` |
| Постобработка CSS | PostCSS + autoprefixer | 8.5 / 10.6 | Вендорные префиксы по `browserslist` |
| Клиентское состояние | Pinia (setup-stores) | 4.1 | Официальный стор Vue, тот же синтаксис, что у компонентов |
| Роутинг | Vue Router | 5.4 | Официальный роутер; ленивые страницы |
| Серверное состояние | TanStack Query (`@tanstack/vue-query`) | 5.104 | Кэш, ретраи, инвалидация, статусы загрузки без ручного кода |
| UI | PrimeVue 4 + `@primeuix/themes` (Aura) + `primeicons` | 4.5 | Большой набор компонентов, дизайн-токены, светлая и тёмная темы |
| Линтинг | ESLint 10 (flat config), `typescript-eslint`, `eslint-plugin-vue` | 10.13 | Единый стиль и проверка границ FSD |
| Тесты | Vitest + `@vue/test-utils` + jsdom, `@vitest/coverage-v8` | 4.1 | Тот же конфиг, что и у Vite, быстрый запуск |
| Git-хуки | Husky + lint-staged + commitlint | 9.1 / 17 / 21 | Проверки перед коммитом, Conventional Commits |

Точные версии — в [package.json](package.json) и `pnpm-lock.yaml`. На главной странице версии подставляются из `package.json` при сборке.

Пакеты сверх обязательного стека:

- **`unplugin-vue-components` + `@primevue/auto-import-resolver`** — автоимпорт компонентов PrimeVue (рекомендованный PrimeVue способ: в бандл попадают только используемые компоненты). Свои компоненты импортируются явно, чтобы границы FSD были видны в коде.
  Автоимпортируемые компоненты не видны сканеру зависимостей Vite, поэтому используемые компоненты PrimeVue перечислены в `optimizeDeps.include` в [vite.config.ts](vite.config.ts). Подключили новый компонент — добавьте его в этот список.
- **`jiti`** — нужен ESLint для чтения конфига на TypeScript (`eslint.config.ts`).
- **`@vitest/eslint-plugin`** — правила ESLint для тестов (например, запрет `it.only`).

Почему границы FSD проверяются правилом `no-restricted-imports`, а не `eslint-plugin-boundaries` или `steiger`: встроенного правила ESLint достаточно для трёх нужных проверок (импорт только из нижележащих слоёв, запрет кросс-импорта слайсов одного слоя, запрет глубоких импортов в обход `index.ts`). Ему не нужен резолвер импортов, оно работает в редакторе и в lint-staged и не добавляет зависимостей. Правила генерируются в [eslint.config.ts](eslint.config.ts) по списку слоёв.

## 3. Требования

- **Node.js** `^22.18.0` или `>=24.12.0` (версия для `nvm` — в [.nvmrc](.nvmrc));
- **pnpm** 11 (версия закреплена в поле `packageManager` в `package.json`). Проще всего включить его через Corepack: `corepack enable`. Corepack сам скачает нужную версию.

Почему pnpm: установка быстрее и занимает меньше места благодаря общему хранилищу пакетов. Строгий `node_modules` не даёт импортировать пакеты, которых нет в `package.json`. Скрипты зависимостей по умолчанию не запускаются, разрешённые перечислены в `allowBuilds` в [pnpm-workspace.yaml](pnpm-workspace.yaml). Не используйте `npm install` или `yarn`: lock-файл проекта — `pnpm-lock.yaml`.

## 4. Быстрый старт

```bash
git clone https://github.com/leaderdsn/vue-interview-prep.git
cd vue-interview-prep
pnpm install       # также установит git-хуки (скрипт prepare)
pnpm dev           # http://localhost:5173
```

### Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `VITE_APP_TITLE` | `Vue Interview Prep` | Название приложения в шапке и `<title>` |
| `VITE_API_URL` | `/api` | Базовый URL HTTP-клиента (`src/shared/api`) |
| `VITE_FIREBASE_*` | пусто | Конфиг Firebase для синхронизации прогресса (см. раздел «Синхронизация между устройствами»); без него кнопка входа скрыта |

- `.env` — публичные значения по умолчанию, хранится в git.
- `.env.local` — локальные переопределения, в git не попадает. Список всех переменных — в [.env.example](.env.example).
- Типы переменных описаны в [env.d.ts](env.d.ts), в коде читаются через `env` из `@/shared/config`.

> Все переменные с префиксом `VITE_` попадают в клиентский бандл. Секреты в них хранить нельзя.

## 5. Скрипты

| Скрипт | Что делает |
|---|---|
| `pnpm dev` | Dev-сервер с HMR |
| `pnpm build` | Проверка типов (`vue-tsc --build`) и production-сборка в `dist/` |
| `pnpm preview` | Локальный просмотр собранного `dist/` |
| `pnpm type-check` | Проверка типов TypeScript и шаблонов Vue |
| `pnpm lint` | ESLint по всему проекту (с кэшем) |
| `pnpm lint:fix` | ESLint с автоисправлением |
| `pnpm test` | Однократный прогон тестов |
| `pnpm test:watch` | Тесты в watch-режиме |
| `pnpm test:coverage` | Тесты с отчётом о покрытии (`coverage/`) |
| `pnpm prepare` | Установка git-хуков Husky (запускается автоматически при `pnpm install`) |

## 6. Архитектура: Feature-Sliced Design

```
src/
  app/                    # инициализация: провайдеры (Pinia, Router, VueQuery, PrimeVue), глобальные стили
  pages/
    home/                 # список направлений, общий прогресс, «Продолжить»
    level/                # уровень: шаги-темы, тема, тест
    not-found/
  widgets/
    app-header/
    track-grid/           # карточки направлений со статусом уровней
  features/
    run-quiz/             # тест: сессия, проверка, подсчёт результата
    manage-progress/      # экспорт, импорт и сброс прогресса
    sync-progress/        # вход через Google и синхронизация прогресса через Firebase
    toggle-theme/
  entities/
    track/                # типы, индекс направлений, ленивая загрузка уровней, контент (data/)
    progress/             # стор прогресса с сохранением в localStorage, слияние для синхронизации
  shared/                 # api, config, lib, styles (в т. ч. _content.sass для HTML тем)
```

**Правила импортов** (проверяются ESLint):

1. Слой импортирует только из слоёв ниже: `app → pages → widgets → features → entities → shared`.
2. Слайсы одного слоя не импортируют друг друга (`features/a` не знает о `features/b`).
3. Наружу слайс отдаёт код только через `index.ts`: `import { fetchLevel } from '@/entities/track'`. В `shared` публичный API есть у каждого сегмента: `@/shared/config`, `@/shared/lib`.
4. Внутри слайса используются относительные импорты.

Алиасы: один алиас `@` → `src/`.

## 7. Стили

- **Почему Sass в indented-синтаксисе.** Он короче SCSS (без `{}` и `;`), отступы делают вложенность наглядной, а модульная система `@use` / `@forward` даёт пространства имён без глобальных переменных. SCSS-файлы и `@import` в проекте запрещены.
- **Где токены.** В [src/shared/styles/](src/shared/styles/): `_tokens.sass` (отступы, радиусы, брейкпоинты, шрифты), `_mixins.sass` (`media`, `container` и др.), `_index.sass` (`@forward` обоих файлов).
- **Стили компонентов — в отдельных файлах.** Рядом с каждым компонентом лежит `.sass` с тем же именем (`QuizRunner.vue` → `QuizRunner.sass`). Блок `<style>` в SFC только подключает его:

  ```vue
  <style lang="sass" scoped>
  @use './QuizRunner'
  </style>
  ```

  `scoped` работает и для подключённых правил: Vue проставляет атрибуты `data-v-*` уже скомпилированному CSS блока.
- **Как подключать токены.** Файл стилей компонента первой строкой подключает токены и миксины под пространством имён `ds`:

  ```sass
  @use "@/shared/styles" as ds

  .quiz-runner
    padding: ds.$space-4
    color: var(--p-text-color)

    +ds.media(md)
      padding: ds.$space-6
  ```

  `vite.config.ts` через `additionalData` добавляет этот `@use` автоматически, но только в сам блок `<style lang="sass">`. В файлы, подключённые через `@use`, он не попадает, поэтому в `.sass` компонента его пишут явно.

- **Цвета** берутся только из CSS-переменных PrimeVue (`var(--p-primary-color)`, `var(--p-content-background)` и т.д.), поэтому тёмная тема работает без дополнительного кода. Тёмный режим включает класс `.app-dark` на `<html>`. Пользователь выбирает режим в шапке: светлая, тёмная или «как в системе» (по умолчанию). В системном режиме тема меняется вслед за настройкой ОС, в том числе без перезагрузки страницы. Чтобы при загрузке не мелькала светлая тема, класс ставит встроенный скрипт в `index.html` ещё до первой отрисовки.
- **Именование классов** — БЭМ плюс `scoped`.
- **Vite 8** всегда использует современный Sass-компилятор, поэтому опция `api: 'modern-compiler'` в нём удалена и в конфиге не нужна.

## 8. Контент и прогресс

**Контент** лежит в `src/entities/track/data/`:

- `tracks.json` и `tracks-extra.json` — индекс направлений: названия, описания уровней, заголовки тем, число вопросов. Попадает в основной бандл.
- `levels/<направление>-<уровень>.json` — темы и тест уровня, например `vue-middle.json`. Каждый файл — отдельный чанк, грузится при открытии уровня (`import.meta.glob`).

HTML тем доверенный и использует только классы из `src/shared/styles/_content.sass`: `note`, `note warn`, `say`, `pre.code` (комментарии в `span.c`), `code-label`, `table-wrap`, `figure`/`flow`/`step`/`arrow`, `boxes`/`box`.

Вопрос теста:

```ts
{ topic: 0, type: 'theory' | 'practice', question: '…', code?: '…', options: ['…', '…', '…', '…'], answer: 1, explanation: '…' }
```

`topic` — номер темы уровня, где объясняется ответ; `answer` — индекс верного варианта.

**Как добавить направление:** положите три файла `levels/<id>-junior|middle|senior.json` и добавьте запись в `tracks-extra.json`. Заголовки тем в индексе должны совпадать с заголовками в файлах уровней — это и форму вопросов проверяет тест [content.spec.ts](src/entities/track/api/content.spec.ts).

**Прогресс** хранит `useProgressStore` из `entities/progress` в `localStorage` под ключом `vue-interview-prep:progress`:

```ts
{ version: 1, levels: { 'vue-middle': { seenTopics: [0, 1], bestScore: 83, lastScore: 75, attempts: 2, passedAt: '…' } }, lastVisited: { levelId: 'vue-middle', step: 'quiz' } }
```

Тема отмечается просмотренной при открытии, уровень считается пройденным при результате теста от 80 %. Повреждённые записи при чтении отбрасываются. Если меняете формат — поднимите `version` и добавьте миграцию. На главной есть экспорт в JSON, импорт и сброс.

### Синхронизация между устройствами

Кнопка с облаком в шапке открывает вход через Google. После входа прогресс хранится в Firebase Realtime Database по пути `interviewPrep/users/<uid>/progress` и обновляется на всех устройствах в реальном времени; `localStorage` остаётся локальной копией, так что приложение работает и без сети. При первом входе прогресс устройства объединяется с прогрессом аккаунта: темы складываются, берётся лучший результат и больше попыток. Дальше источник правды — база: сброс на одном устройстве сбрасывает прогресс везде. SDK Firebase загружается отдельным чанком и только у тех, кто включил синхронизацию.

Используется тот же Firebase-проект, что и у life-tracker-planner и ussr-school-prep. Настройка:

1. **Security → Authentication → Sign-in method** — включите **Google**.
2. **Authentication → Settings → Authorized domains** — добавьте `leaderdsn.github.io` (`localhost` там уже есть).
3. **Realtime Database → Rules** — вставьте содержимое [database.rules.json](database.rules.json) и опубликуйте. Файл содержит правила всех трёх проектов (`households`, `interviewPrep`, `schoolPrep`): каждому пользователю доступна только его запись. При изменении обновите файл во всех трёх репозиториях.
4. Для локального запуска создайте `.env.local` по образцу [.env.example](.env.example).
5. Для сайта на GitHub Pages добавьте те же значения в **Settings → Secrets and variables → Actions** репозитория
   (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`) и перезапустите workflow **Deploy**.

Ключи веб-конфига Firebase публичные по своей природе; доступ к данным ограничивают правила базы.

## 9. Качество кода

### Тестирование

- Vitest + `@vue/test-utils` + jsdom, конфиг — [vitest.config.ts](vitest.config.ts) (наследует `vite.config.ts`).
- Файлы `*.spec.ts` лежат рядом с кодом.
- Названия тестов пишутся на русском и описывают поведение: `describe('useThemeStore')` → `it('восстанавливает выбранный режим из localStorage')`. В `describe` указывается имя тестируемого юнита, как в коде.
- Обязательно покрываются: `shared/lib`, Pinia-сторы, composables, функции `api/`, ключевые компоненты фич.
- Покрытие: `pnpm test:coverage`, HTML-отчёт в `coverage/`.

### Линтинг

- [eslint.config.ts](eslint.config.ts): рекомендованные правила Vue и TypeScript, порядок блоков SFC, `import type`, запрет `any`, правила Vitest и границы FSD.

### Git-хуки и коммиты

| Хук | Что запускается |
|---|---|
| `pre-commit` | `lint-staged`: `eslint --fix` и `vitest related --run` для изменённых `.ts` / `.vue` |
| `commit-msg` | `commitlint`: проверка формата Conventional Commits |

Формат коммита — `type(scope): описание`:

```
feat(run-quiz): show explanation after check
fix(toggle-theme): persist theme on first visit
docs: describe env variables
```

Типы: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `build`, `ci`, `chore`, `revert`. Ветки: `feature/<кратко>`, `fix/<кратко>`, `chore/<кратко>`.

