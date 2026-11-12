import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONSENT_KEY } from '../config/consent'

import { useConsentStore } from './consentStore'

import type * as SharedLib from '@/shared/lib'

const lib = vi.hoisted(() => ({ configured: true, enableAnalytics: vi.fn(() => Promise.resolve(true)) }))

vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedLib>()),
  isAnalyticsConfigured: () => lib.configured,
  enableAnalytics: lib.enableAnalytics,
}))

describe('согласие на статистику', () => {
  beforeEach(() => {
    localStorage.clear()
    lib.configured = true
    setActivePinia(createPinia())
  })

  it('пока выбора нет, показывает баннер и не включает аналитику', () => {
    const consent = useConsentStore()
    consent.init()

    expect(consent.bannerVisible).toBe(true)
    expect(lib.enableAnalytics).not.toHaveBeenCalled()
  })

  it('после согласия включает аналитику, запоминает выбор и прячет баннер', () => {
    const consent = useConsentStore()

    consent.decide('granted')

    expect(lib.enableAnalytics).toHaveBeenCalledOnce()
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted')
    expect(consent.bannerVisible).toBe(false)
  })

  it('отказ запоминается, и при следующем визите аналитика не грузится', () => {
    useConsentStore().decide('denied')
    setActivePinia(createPinia())

    const consent = useConsentStore()
    consent.init()

    expect(consent.bannerVisible).toBe(false)
    expect(lib.enableAnalytics).not.toHaveBeenCalled()
  })

  it('без настроек GA баннера нет', () => {
    lib.configured = false

    expect(useConsentStore().bannerVisible).toBe(false)
  })
})
