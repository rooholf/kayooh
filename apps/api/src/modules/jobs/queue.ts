import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { runSweeper } from "./sweeper.js";
import {
  deliverNotification,
  runOutboxDispatch,
  NOTIFICATION_MAX_ATTEMPTS,
  NOTIFICATION_BACKOFF_MS,
  type NotificationJobData,
} from "../notifications/index.js";

let connection: IORedis | null = null;
let releaseHoldQueue: Queue | null = null;
let sweeperQueue: Queue | null = null;
let notificationsQueue: Queue | null = null;

export function getRedisConnection(redisUrl?: string): IORedis | null {
  if (!redisUrl) return null;
  if (connection) return connection;
  try {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
    return connection;
  } catch {
    return null;
  }
}

export function getReleaseHoldQueue(redisUrl?: string): Queue | null {
  const conn = getRedisConnection(redisUrl);
  if (!conn) return null;
  if (releaseHoldQueue) return releaseHoldQueue;
  releaseHoldQueue = new Queue("release-hold", { connection: conn });
  return releaseHoldQueue;
}

export function getSweeperQueue(redisUrl?: string): Queue | null {
  const conn = getRedisConnection(redisUrl);
  if (!conn) return null;
  if (sweeperQueue) return sweeperQueue;
  sweeperQueue = new Queue("sweeper", { connection: conn });
  return sweeperQueue;
}

/**
 * One queue for the whole notification pipeline (SRS §8): the per-send jobs
 * (`notification-send`) and the 5 s drain job (`outbox-dispatch`).
 */
export function getNotificationsQueue(redisUrl?: string): Queue | null {
  const conn = getRedisConnection(redisUrl);
  if (!conn) return null;
  if (notificationsQueue) return notificationsQueue;
  notificationsQueue = new Queue("notifications", { connection: conn });
  return notificationsQueue;
}

export async function enqueueReleaseHold(
  reservationId: string,
  expiresAt: Date,
  redisUrl?: string,
): Promise<void> {
  const q = getReleaseHoldQueue(redisUrl);
  if (!q) return;
  const delay = Math.max(0, expiresAt.getTime() - Date.now());
  try {
    await q.add("release-hold", { reservationId }, { jobId: `hold:${reservationId}`, delay });
  } catch {
    // Never fail the reservation because the queue is unavailable.
  }
}

export async function registerSweeperSchedule(redisUrl?: string): Promise<void> {
  const q = getSweeperQueue(redisUrl);
  if (!q) return;
  try {
    await q.upsertJobScheduler("sweeper", { every: 60_000 }, { name: "sweeper", data: {} });
  } catch {
    // Best-effort; the worker process can register it too.
  }
}

/**
 * Registers the `outbox-dispatch` repeatable (SRS §8: every 5 s). Best-effort
 * at boot; Redis-less deployments rely on an external driver hitting
 * `runOutboxDispatch()` the same way the sweeper does.
 */
export async function registerOutboxSchedule(redisUrl?: string): Promise<void> {
  const q = getNotificationsQueue(redisUrl);
  if (!q) return;
  try {
    await q.upsertJobScheduler("outbox-dispatch", { every: 5_000 }, { name: "outbox-dispatch", data: {} });
  } catch {
    // Best-effort; the worker process can register it too.
  }
}

/**
 * Post-commit BullMQ handoff for ONE notification (FR-NOT-01.2). Native
 * BullMQ retries: 5 attempts, exponential backoff starting at 30 s — the
 * ladder it produces matches NOTIFICATION_BACKOFF_MS. Best-effort: if Redis
 * is down the outbox-dispatch loop re-hands the row on a later tick.
 * Deduped by jobId so a retried dispatch tick never double-sends.
 */
export async function enqueueNotificationSend(data: NotificationJobData, redisUrl?: string): Promise<void> {
  const q = getNotificationsQueue(redisUrl);
  if (!q) throw new Error("Redis unavailable; outbox-dispatch floor will handle delivery");
  await q.add("notification-send", data, {
    jobId: `notif:${data.notificationId}`,
    attempts: NOTIFICATION_MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: NOTIFICATION_BACKOFF_MS[0] },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
}

export async function processJob(job: Job): Promise<unknown> {
  if (job.name === "release-hold") {
    await runSweeper();
    return { ok: true };
  }
  if (job.name === "sweeper") {
    return runSweeper();
  }
  if (job.name === "notification-send") {
    await deliverNotification(job.data as NotificationJobData);
    return { ok: true };
  }
  if (job.name === "outbox-dispatch") {
    // Redis path: claimed outbox rows go back through this queue as
    // notification-send jobs. inline=false floor is only used Redis-less.
    return runOutboxDispatch({ enqueue: (data) => enqueueNotificationSend(data) });
  }
  throw new Error(`unknown job: ${job.name}`);
}

export async function startWorker(redisUrl: string): Promise<Worker> {
  const conn = getRedisConnection(redisUrl);
  if (!conn) throw new Error("Redis unavailable; cannot start worker");
  const worker = new Worker("release-hold", processJob, { connection: conn });
  const sweeperWorker = new Worker("sweeper", processJob, { connection: conn });
  const notificationsWorker = new Worker("notifications", processJob, {
    connection: conn,
    // The 5 s scheduler fires outbox-dispatch jobs; concurrency > 1 would
    // only double-claim ticks that SKIP LOCKED already prevents — keep 1.
    concurrency: 1,
  });
  worker.on("failed", (j, err) => console.error("release-hold failed", j?.id, err));
  sweeperWorker.on("failed", (j, err) => console.error("sweeper failed", j?.id, err));
  notificationsWorker.on("failed", (j, err) => console.error("notifications failed", j?.id, err));
  return worker;
}