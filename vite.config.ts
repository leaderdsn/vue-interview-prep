import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

type PackageJson = {
  version: string
}

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as PackageJson

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/vue-interview-prep/' : '/',
  plugins: [
    vue(),
    // Auto-imports PrimeVue components only. Our own components are imported explicitly
    // so FSD boundaries stay visible in the code.
    Components({
      dirs: [],
      dts: 'components.d.ts',
      resolvers: [PrimeVueResolver()],
    }),
  ],
  optimizeDeps: {
    // Auto-imported components are invisible to Vite's dependency scanner, so on a cold start
    // they get optimized on the fly and force a reload with two Vue copies in memory.
    // Keep this list in sync with the PrimeVue components used in the app (see components.d.ts).
    include: [
      'primevue/button',
      'primevue/message',
      'primevue/popover',
      'primevue/progressbar',
      'primevue/selectbutton',
      'primevue/skeleton',
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
        // Design tokens and mixins are available in every .sass file and <style lang="sass">
        // under the `ds` namespace: `ds.$space-4`, `+ds.media(md)`.
        additionalData: '@use "@/shared/styles" as ds\n',
      },
    },
  },
}))
