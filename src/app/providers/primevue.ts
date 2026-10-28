import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

import { DARK_MODE_CLASS } from '@/features/toggle-theme'

import type { PrimeVueConfiguration } from 'primevue/config'

const AppPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{emerald.50}',
      100: '{emerald.100}',
      200: '{emerald.200}',
      300: '{emerald.300}',
      400: '{emerald.400}',
      500: '{emerald.500}',
      600: '{emerald.600}',
      700: '{emerald.700}',
      800: '{emerald.800}',
      900: '{emerald.900}',
      950: '{emerald.950}',
    },
  },
})

export const primeVueOptions: PrimeVueConfiguration = {
  ripple: true,
  theme: {
    preset: AppPreset,
    options: {
      darkModeSelector: `.${DARK_MODE_CLASS}`,
      cssLayer: {
        name: 'primevue',
        order: 'reset, primevue, app',
      },
    },
  },
}
