import { config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'

// Компонентам PrimeVue нужен установленный плагин; стили в юнит-тестах не важны.
config.global.plugins = [[PrimeVue, { theme: 'none' }]]
