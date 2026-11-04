/**
 * Rate limiting (SRS 3.2 / FR-ID-01.2 / FR-ID-02.2).
 *
 * Store: Redis when REDIS_URL is set (production path, SRS 2). A process-local
 * store is used only when Redis is unavailable — development and test setups.
 * NFR-08 style alerts (5xx, backlog) belong to observability, not here.
 */
import type { Redis } from "ioredis";
import type { HitOptions, HitResult, RateLimiter } from "./types.js";

export type { HitOptions, HitResult, RateLimiter };

/* ------------------------------------------------------------------ */
/* Redis implementation (fixed-window counter, atomic Lua-free path).  */
/* ------------------------------------------------------------------ */

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Pick<Redis, "incr" | "expire" | "ttl" | "pttl" | "get">) {}

  async hit(key: string, opts: HitOptions): Promise<HitResult> {
    const redisKey = `rl:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, opts.windowSec);
    }
    const pttl = await this.redis.pttl(redisKey);
    const retryAfterSec = pttl > 0 ? Math.ceil(pttl / 1000) : opts.windowSec;
    return {
      allowed: count <= opts.limit,
      retryAfterSec,
      count,
    };
  }

  async peek(key: string): Promise<number> {
    const v = await this.redis.get(`rl:${key}`);
    return v === null ? 0 : Number(v);
  }
}

/* ------------------------------------------------------------------ */
/* In-memory fallback (dev/test only — single process semantics).      */
/* ------------------------------------------------------------------ */

interface Bucket {
  count: number;
  resetAtMs: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  async hit(key: string, opts: HitOptions): Promise<HitResult> {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAtMs <= now) {
      bucket = { count: 0, resetAtMs: now + opts.windowSec * 1000 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= opts.limit,
      retryAfterSec: Math.ceil((bucket.resetAtMs - now) / 1000),
      count: bucket.count,
    };
  }

  async peek(key: string): Promise<number> {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAtMs <= Date.now()) return 0;
    return bucket.count;
  }
}

/* ------------------------------------------------------------------ */

export type RateLimiterStore = "redis" | "memory";

let lazyRedisClient: Redis | undefined;

async function getRedisClient(url: string): Promise<Redis | undefined> {
  try {
    const mod = await import("ioredis");
    const RedisCtor = mod.default;
    lazyRedisClient = lazyRedisClient ?? new RedisCtor(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    await lazyRedisClient.ping();
    return lazyRedisClient;
  } catch {
    return undefined;
  }
}

export async function createRateLimiter(redisUrl?: string): Promise<{
  limiter: RateLimiter;
  store: RateLimiterStore;
  close(): Promise<void>;
}> {
  if (redisUrl) {
    const client = await getRedisClient(redisUrl);
    if (client) {
      return {
        limiter: new RedisRateLimiter(client),
        store: "redis",
        close: async () => {
          await client.quit().catch(() => client.disconnect());
        },
      };
    }
  }
  return {
    limiter: new MemoryRateLimiter(),
    store: "memory",
    close: async () => {},
  };
}
