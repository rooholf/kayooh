/**
 * Notifications module — NEG-6 boundary.
 * FR-NOT-01 (transactional outbox + delivery) lives here:
 * `enqueueNotification` (in-transaction), `deliverNotification` (per-attempt
 * send + retry bookkeeping + terminal fallback), `runOutboxDispatch` (the
 * 5 s outbox loop — `enqueue`-less form is the Redis-less floor).
 */
export {
  enqueueNotification,
  deliverNotification,
  runOutboxDispatch,
  NOTIFICATION_BACKOFF_MS,
  NOTIFICATION_MAX_ATTEMPTS,
  type EnqueueNotificationInput,
  type NotificationJobData,
  type DeliverNotificationOptions,
  type OutboxDispatchOptions,
} from "./outbox.js";