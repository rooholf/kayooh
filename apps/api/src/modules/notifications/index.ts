/**
 * Notifications module — NEG-6 boundary.
 * FR-NOT-01 (transactional outbox + BullMQ delivery) lives here.
 */
export {
  enqueueNotification,
  deliverNotification,
  NOTIFICATION_BACKOFF_MS,
  NOTIFICATION_MAX_ATTEMPTS,
  type EnqueueNotificationInput,
  type NotificationJobData,
} from "./outbox.js";