<script setup lang="ts">
import { useConsentStore } from '../model/consentStore'

const consent = useConsentStore()
</script>

<template>
  <section v-if="consent.bannerVisible" class="consent-banner" role="region" aria-label="Согласие на сбор статистики">
    <p class="consent-banner__text">
      Мы хотим считать посещения через Google Analytics, чтобы понимать, какие темы полезны. Для этого Google ставит
      cookies. Прогресс и ответы в тестах в статистику не попадают.
    </p>
    <div class="consent-banner__actions">
      <Button label="Разрешить" size="small" @click="consent.decide('granted')" />
      <Button label="Отказаться" severity="secondary" variant="outlined" size="small" @click="consent.decide('denied')" />
    </div>
  </section>
</template>

<style lang="sass" scoped>
@use './ConsentBanner'
</style>
