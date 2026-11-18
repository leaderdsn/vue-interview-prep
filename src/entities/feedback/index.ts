import { defineAsyncComponent } from 'vue'

export {
  deleteFeedback,
  FeedbackError,
  feedbackError,
  feedbackErrorMessage,
  fetchAllFeedback,
  fetchFeedbackImages,
  fetchMyFeedback,
  sendFeedback,
  updateFeedback,
} from './api/feedbackApi'
export type { FeedbackErrorCode } from './api/feedbackApi'
export {
  FEEDBACK_IMAGE_LIMITS,
  FEEDBACK_IMAGE_PREFIXES,
  FEEDBACK_IMAGES_PATH,
  FEEDBACK_INTERVAL_MS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KINDS,
  FEEDBACK_LIMITS,
  FEEDBACK_PATH,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  feedbackImagesPath,
  feedbackLimitPath,
} from './config/feedback'
export {
  buildFeedbackRecord,
  cleanFeedbackImages,
  describeContext,
  feedbackImagesValue,
  feedbackIssues,
  isFeedbackImage,
  isFeedbackKind,
  isFeedbackStatus,
  normalizeQuote,
  parseFeedbackImages,
  parseFeedbackItem,
  parseFeedbackList,
} from './lib/report'
export type {
  FeedbackContext,
  FeedbackDraft,
  FeedbackItem,
  FeedbackKind,
  FeedbackRecord,
  FeedbackStatus,
} from './model/types'

/** Список «Мои замечания»: отдельный чанк, грузится, только когда список раскрыли. */
export const MyFeedback = defineAsyncComponent(() => import('./ui/MyFeedback.vue'))
