import { config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'

// PrimeVue components need the plugin installed; styles are irrelevant in unit tests.
config.global.plugins = [[PrimeVue, { theme: 'none' }]]
