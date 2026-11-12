import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { defineConfig, loadEnv } from 'vite'

import { prerender } from './build/prerender.ts'

type PackageJson = {
  version: string
}

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as PackageJson

// Документация: https://vite.dev/config/
export default defineConfig(({ command, isPreview, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    base: command === 'build' || isPreview ? '/vue-interview-prep/' : '/',
    plugins: [
      vue(),
      // Автоимпорт только для компонентов PrimeVue. Собственные компоненты импортируются явно,
      // чтобы границы FSD оставались видны в коде.
      Components({
        dirs: [],
        dts: 'components.d.ts',
        resolvers: [PrimeVueResolver()],
      }),
      // Статический HTML каждой страницы, чтобы поисковики видели контент без JS (см. README, раздел SEO).
      prerender({
        appTitle: env.VITE_APP_TITLE || 'Frontend подготовка',
        siteUrl: env.VITE_SITE_URL || 'https://leaderdsn.github.io/vue-interview-prep',
        dataDir: fileURLToPath(new URL('./src/entities/track/data', import.meta.url)),
      }),
    ],
    optimizeDeps: {
      // Автоимпортируемые компоненты не видны сканеру зависимостей Vite, поэтому при холодном старте
      // они оптимизируются на лету и вызывают перезагрузку с двумя копиями Vue в памяти.
      // Синхронизируйте этот список с компонентами PrimeVue в приложении (см. components.d.ts).
      include: [
        'primevue/button',
        'primevue/dialog',
        'primevue/inputtext',
        'primevue/message',
        'primevue/popover',
        'primevue/progressbar',
        'primevue/progressspinner',
        'primevue/select',
        'primevue/selectbutton',
        'primevue/skeleton',
        'primevue/textarea',
      ],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    css: {
      preprocessorOptions: {
        sass: {
          // Дизайн-токены и миксины доступны в каждом .sass-файле и <style lang="sass">
          // в пространстве имён `ds`: `ds.$space-4`, `+ds.media(md)`.
          additionalData: '@use "@/shared/styles" as ds\n',
        },
      },
    },
  }
})
