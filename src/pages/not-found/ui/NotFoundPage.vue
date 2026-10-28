<script setup lang="ts">
import { ROUTE_NAMES } from '@/shared/config'
</script>

<template>
  <section class="not-found-page" aria-labelledby="not-found-title">
    <span class="not-found-page__code" aria-hidden="true">404</span>
    <h1 id="not-found-title" class="not-found-page__title">Страница не найдена</h1>
    <p class="not-found-page__text">Возможно, она была перемещена или вы ошиблись в адресе.</p>
    <RouterLink v-slot="{ navigate }" :to="{ name: ROUTE_NAMES.home }" custom>
      <Button label="На главную" icon="pi pi-home" @click="navigate" />
    </RouterLink>
  </section>
</template>

<style lang="sass" scoped>
@use './NotFoundPage'
</style>
