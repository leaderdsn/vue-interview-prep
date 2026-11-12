import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'

import { installSeo } from '../seo'

import { primeVueOptions } from './primevue'
import { vueQueryOptions } from './query'
import { router } from './router'

import type { App } from 'vue'

export function installProviders(app: App) {
  app.use(createPinia())
  installSeo(router)
  app.use(router)
  app.use(VueQueryPlugin, vueQueryOptions)
  app.use(PrimeVue, primeVueOptions)
}
