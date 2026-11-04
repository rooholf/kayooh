import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { runSweeper } from "./sweeper.js";

let connection: IORedis | null = null;
let releaseHoldQueue: Queue | null = null;
let sweeperQueue: Queue | null = null;

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

export async function processJob(job: Job): Promise<unknown> {
  if (job.name === "release-hold") {
    await runSweeper();
    return { ok: true };
  }
  if (job.name === "sweeper") {
    return runSweeper();
  }
  throw new Error(`unknown job: ${job.name}`);
}

export async function startWorker(redisUrl: string): Promise<Worker> {
  const conn = getRedisConnection(redisUrl);
  if (!conn) throw new Error("Redis unavailable; cannot start worker");
  const worker = new Worker("release-hold", processJob, { connection: conn });
  const sweeperWorker = new Worker("sweeper", processJob, { connection: conn });
  worker.on("failed", (j, err) => console.error("release-hold failed", j?.id, err));
  sweeperWorker.on("failed", (j, err) => console.error("sweeper failed", j?.id, err));
  return worker;
}