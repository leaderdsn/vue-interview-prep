import { QueryClient } from '@tanstack/vue-query'

import type { VueQueryPluginOptions } from '@tanstack/vue-query'

const STALE_TIME_MS = 60_000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const vueQueryOptions: VueQueryPluginOptions = { queryClient }
