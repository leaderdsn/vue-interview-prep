import { fileURLToPath } from 'node:url'

import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig({ command: 'serve', mode: 'test' }),
  defineConfig({
    test: {
      environment: 'jsdom',
      root: fileURLToPath(new URL('./', import.meta.url)),
      include: ['src/**/*.spec.ts'],
      exclude: [...configDefaults.exclude],
      setupFiles: ['./vitest.setup.ts'],
      // .env.local настраивает боевую базу; тесты не должны к ней обращаться
      env: { VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_DATABASE_URL: '' },
      clearMocks: true,
      restoreMocks: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,vue}'],
        exclude: ['src/**/*.spec.ts', 'src/**/index.ts', 'src/app/main.ts'],
        reporter: ['text', 'html'],
      },
    },
  }),
)
