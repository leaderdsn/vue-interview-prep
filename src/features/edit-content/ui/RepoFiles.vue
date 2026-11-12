<script setup lang="ts">
import type { LevelDraft } from '../model/levelDraft'

defineProps<{
  /** Черновик уровня: файлы собираются из обеих частей, в том числе несохранённых. */
  draft: LevelDraft
}>()
</script>

<template>
  <div class="repo-files">
    <p class="repo-files__hint">
      Поисковики, главная и sitemap берут темы из файлов репозитория (пререндер при сборке): чтобы правка попала туда,
      скачайте файлы и закоммитьте их.
    </p>
    <p v-if="draft.topicCountChanged" class="repo-files__hint repo-files__hint--accent" role="note">
      Чтобы новая тема появилась на главной и в поиске, положите оба файла в репозиторий.
    </p>
    <p v-else-if="draft.indexChanged" class="repo-files__hint repo-files__hint--accent" role="note">
      Заголовки тем или число вопросов отличаются от индекса направлений: кладя JSON уровня в репозиторий,
      положите рядом и индекс, иначе <code>content.spec.ts</code> упадёт.
    </p>
    <div class="repo-files__actions">
      <Button label="Скачать JSON уровня" icon="pi pi-download" severity="secondary" variant="text" @click="draft.downloadLevel()" />
      <Button
        v-if="draft.indexFileName"
        label="Скачать индекс направлений"
        icon="pi pi-download"
        severity="secondary"
        variant="text"
        :title="`Файл ${draft.indexFileName} с заголовками тем и числом вопросов этого уровня из редактора`"
        @click="draft.downloadIndex()"
      />
    </div>
  </div>
</template>

<style lang="sass" scoped>
@use './RepoFiles'
</style>
