import { computed, ref } from 'vue'

import { FEEDBACK_IMAGE_LIMITS } from '@/entities/feedback'

import { ImageAttachError, imageErrorMessage, prepareImage } from '../lib/image'

/** Приложенная картинка: data URL после сжатия и ключ для списка превью. */
export type ImageAttachment = { id: number; url: string }

/** Файлы из буфера обмена или перетаскивания (в разных браузерах они лежат в `files` или в `items`). */
export function filesFromTransfer(data: DataTransfer | null | undefined): File[] {
  if (!data) return []
  const files = Array.from(data.files ?? [])
  if (files.length) return files
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
}

/** Перетаскивают файлы, а не выделенный текст. */
const draggingFiles = (data: DataTransfer | null | undefined) => Array.from(data?.types ?? []).includes('Files')

/**
 * Картинки в форме замечания: добавление выбором файла, вставкой из буфера (Ctrl+V) и перетаскиванием,
 * сжатие, превью и удаление. Код обработки картинок живёт в чанке формы и в основной бандл не попадает.
 */
export function useImageAttachments() {
  const images = ref<ImageAttachment[]>([])
  /** Идёт сжатие: отправку стоит подождать. */
  const processing = ref(false)
  const error = ref<string | null>(null)
  /** Над формой тащат файл — показать зону для броска. */
  const dragging = ref(false)
  let nextId = 0
  /** Растёт при сбросе формы: результаты сжатия, начатого до сброса, отбрасываются. */
  let generation = 0

  const full = computed(() => images.value.length >= FEEDBACK_IMAGE_LIMITS.maxCount)
  const urls = computed(() => images.value.map((image) => image.url))

  async function add(files: readonly File[]) {
    error.value = null
    if (!files.length) return
    if (full.value) {
      error.value = new ImageAttachError('limit').message
      return
    }
    const started = generation
    const free = FEEDBACK_IMAGE_LIMITS.maxCount - images.value.length
    processing.value = true
    try {
      for (const file of files.slice(0, free)) {
        try {
          const url = await prepareImage(file)
          if (started !== generation) return
          if (full.value) break
          images.value = [...images.value, { id: ++nextId, url }]
        } catch (cause) {
          if (started !== generation) return
          error.value = imageErrorMessage(cause)
        }
      }
      if (files.length > free) error.value = new ImageAttachError('limit').message
    } finally {
      if (started === generation) processing.value = false
    }
  }

  function remove(id: number) {
    images.value = images.value.filter((image) => image.id !== id)
    error.value = null
  }

  function reset() {
    generation += 1
    images.value = []
    processing.value = false
    error.value = null
    dragging.value = false
  }

  /** Ctrl+V: перехватываем только вставку файлов, обычный текст вставляется как обычно. */
  function onPaste(event: ClipboardEvent) {
    const data = event.clipboardData
    if (data?.getData?.('text/plain')) return
    const files = filesFromTransfer(data)
    if (!files.length) return
    event.preventDefault()
    void add(files)
  }

  function onDragOver(event: DragEvent) {
    if (!draggingFiles(event.dataTransfer)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    dragging.value = true
  }

  function onDragLeave(event: DragEvent) {
    // dragleave приходит и при переходе на дочерний элемент формы — его пропускаем.
    const target = event.currentTarget as Node | null
    if (target && event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return
    dragging.value = false
  }

  function onDrop(event: DragEvent) {
    dragging.value = false
    const files = filesFromTransfer(event.dataTransfer)
    if (!files.length) return
    event.preventDefault()
    void add(files)
  }

  return { images, urls, processing, error, dragging, full, add, remove, reset, onPaste, onDragOver, onDragLeave, onDrop }
}
