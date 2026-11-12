import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { enableAnalytics, isAnalyticsConfigured } from '@/shared/lib'

import { CONSENT_KEY } from '../config/consent'

import type { ConsentChoice } from '../config/consent'

function readChoice(): ConsentChoice | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

function writeChoice(choice: ConsentChoice) {
  try {
    localStorage.setItem(CONSENT_KEY, choice)
  } catch {
    // Без хранилища баннер просто появится снова при следующем визите.
  }
}

/** Согласие на Google Analytics: до него SDK аналитики не загружается и cookies не ставятся. */
export const useConsentStore = defineStore('analytics-consent', () => {
  const available = isAnalyticsConfigured()
  const choice = ref<ConsentChoice | null>(available ? readChoice() : null)
  const reopened = ref(false)

  const bannerVisible = computed(() => available && (choice.value === null || reopened.value))

  /** При старте приложения: включает аналитику тем, кто согласился раньше. */
  function init() {
    if (choice.value === 'granted') void enableAnalytics()
  }

  function decide(next: ConsentChoice) {
    const revoked = choice.value === 'granted' && next === 'denied'
    choice.value = next
    reopened.value = false
    writeChoice(next)
    if (next === 'granted') void enableAnalytics()
    // Уже загруженный SDK аналитики не выгрузить: после отказа перезагружаем страницу, чтобы он перестал работать.
    else if (revoked) location.reload()
  }

  function reopen() {
    reopened.value = true
  }

  return { available, choice, bannerVisible, init, decide, reopen }
})
