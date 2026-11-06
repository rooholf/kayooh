/**
 * API application assembly (NEG-6: single deployable app; modules interact
 * only through exported module functions).
 *
 * Surface:
 *   /healthz, /readyz              — NFR-08
 *   /api/auth/*                    — Better Auth (cookies HttpOnly; Secure; SameSite=Lax)
 *   /api/v1/*                      — versioned SRS API (error envelope 3.2)
 */
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { ERROR_STATUS } from "@repo/contracts";
import { mapAuthError } from "./lib/ba-error-map.js";
import { AppError } from "./lib/errors.js";
import { loggingPlugin } from "./lib/logger.js";
import { pinoRedact } from "./lib/pino-config.js";
import { registerIdempotency } from "./lib/idempotency.js";
import { createRateLimiter } from "./lib/rate-limit.js";
import { createNotificationProvider } from "./lib/notifications.js";
import { loadEnv, type Env } from "./lib/env.js";
import { getDb } from "./lib/db.js";
import type { RateLimiter } from "./lib/types.js";
import {
  createAuthBundle,
  registerIdentityRoutes,
  resolvePrincipal,
} from "./modules/identity/index.js";
import { registerReservationRoutes } from "./modules/reservations/create-reservation.js";
import { registerReallocationRoutes } from "./modules/reservations/reallocation-routes.js";
import { registerStaffRoutes } from "./modules/staff/routes.js";
import { registerCatalogRoutes } from "./modules/catalog/index.js";
import { registerSweeperSchedule } from "./modules/jobs/index.js";
import { registerVerificationRoutes } from "./modules/verification/index.js";
import { registerSseRoutes } from "./modules/sse/index.js";

declare module "fastify" {
  interface FastifyRequest {
    principal?: import("./modules/identity/guards.js").Principal;
  }
  interface FastifyInstance {
    limiter: RateLimiter;
  }
}

export interface BuildAppOptions {
  env?: Partial<Record<string, string | undefined>>;
  /**
   * Test seam: inject a capturing NotificationProvider. Production always
   * uses createNotificationProvider (env-guarded); tests need the OTP code
   * which is otherwise hash-only at rest (FR-ID-01.3).
   */
  notificationProvider?: import("./lib/types.js").NotificationProvider;
}

const IDEMPOTENCY_ROUTES = [
  { method: "POST", url: "/api/v1/reservations" },
  { method: "POST", url: "/api/v1/reservations/:id/reallocate" },
];

export async function buildApp(options: BuildAppOptions = {}): Promise<{
  app: FastifyInstance;
  env: Env;
  close(): Promise<void>;
}> {
  const env = loadEnv(options.env);
  const notificationProvider =
    options.notificationProvider ??
    createNotificationProvider({
      nodeEnv: env.nodeEnv,
      devLogOtp: env.devLogOtp,
    });
  const { limiter, close: closeLimiter } = await createRateLimiter(env.redisUrl);
  const dbHandle = getDb();
  const { auth } = createAuthBundle({
    authSecret: env.authSecret || "dev-insecure-secret-do-not-use-in-production",
    notificationProvider,
    limiter,
  });

  const app = Fastify({
    logger: { level: env.logLevel, redact: pinoRedact },
    genReqId: () => randomUUID(),
    trustProxy: true,
  });

  loggingPlugin(app);
  app.decorate("limiter", limiter);

  /* CORS for browser clients (renter web app). Reflects the request origin for
     dev; public catalog endpoints need no credentials. Preflight short-circuits
     before rate limiting and auth resolution. */
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (typeof origin === "string" && origin.length > 0) {
      void reply.header("Access-Control-Allow-Origin", origin);
      void reply.header("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      void reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      void reply.header("Access-Control-Allow-Headers", "content-type,authorization,x-requested-with");
      void reply.code(204);
      void reply.send();
    }
  });

  /* Error envelope (SRS 3.2) for everything outside /api/auth. */
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      const retryAfter = (error as AppError & { retryAfterSec?: number }).retryAfterSec;
      if (retryAfter) void reply.header("Retry-After", String(retryAfter));
      void reply.code(error.status);
      return reply.send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          requestId: request.id,
        },
      });
    }
    if (error.validation) {
      void reply.code(400);
      return reply.send({
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
          details: error.validation.map((v) => ({
            path: (v.instancePath ?? "").replace(/^\//, "").replace(/\//g, "."),
            issue: v.message ?? "invalid",
          })),
          requestId: request.id,
        },
      });
    }
    app.log.error({ err: error }, "unhandled_error");
    void reply.code(500);
    return reply.send({
      error: { code: "INTERNAL", message: "Internal error", requestId: request.id },
    });
  });

  /* Global rate limits (SRS 3.2): anonymous 120 req/min per IP. The
   * authenticated 600 req/min per user lives in the /api/v1 preHandler. */
  app.addHook("onRequest", async (request: FastifyRequest, reply) => {
    if (reply.sent) return;
    const result = await limiter.hit(`global:ip:${request.ip}`, { limit: 120, windowSec: 60 });
    if (!result.allowed) {
      void reply.header("Retry-After", String(result.retryAfterSec));
      throw new AppError("RATE_LIMITED");
    }
  });

  /* /api/v1: session -> principal (with per-role absolute TTL), then the
   * authenticated user rate limit (600 req/min per user). */
  app.addHook("preHandler", async (request, reply) => {
    if (reply.sent) return;
    if (!request.url.startsWith("/api/v1")) return;
    const principal = await resolvePrincipal(request, async (headers) => {
      return (await auth.api.getSession({ headers })) as never;
    });
    if (principal) {
      request.principal = principal;
      const userLimit = await limiter.hit(`global:user:${principal.userId}`, {
        limit: 600,
        windowSec: 60,
      });
      if (!userLimit.allowed) {
        const err = new AppError("RATE_LIMITED");
        (err as AppError & { retryAfterSec: number }).retryAfterSec = userLimit.retryAfterSec;
        throw err;
      }
    }
  });

  /* Health endpoints (NFR-08). */
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => {
    const postgres = await dbHandle.ready();
    return { status: postgres ? "ok" : "degraded", checks: { postgres } };
  });

  /* Versioned SRS routes. */
  registerIdentityRoutes(app);
  registerReservationRoutes(app);
  registerReallocationRoutes(app);
  registerStaffRoutes(app);
  registerCatalogRoutes(app);
  registerVerificationRoutes(app);
  registerSseRoutes(app);

  /* Better Auth scoped mount (raw body preserved for the BA handler). */
  await app.register(async (scope) => {
    scope.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
      done(null, body as string);
    });
    scope.all("/api/auth/*", async (request, reply) => {
      const raw = request.raw;
      const url = `${request.protocol}://${request.host}${raw.url ?? "/api/auth"}`;
      // Fastify's JSON parser may already have parsed the body; BA needs a
      // string body with the matching content-type.
      let body: string | undefined;
      if (typeof request.body === "string" && request.body.length > 0) {
        body = request.body;
      } else if (request.body !== undefined && request.body !== null) {
        body = JSON.stringify(request.body);
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers)) {
        if (typeof v === "string") headers[k] = v;
      }
      if (body !== undefined && !headers["content-type"]) {
        headers["content-type"] = "application/json";
      }
      const req = new Request(url, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : body,
      });
      const res = await auth.handler(req);
      void reply.code(res.status);
      res.headers.forEach((value, key) => {
        if (key === "set-cookie") {
          // Multiple Set-Cookie headers must not be collapsed.
          const cookies = res.headers.getSetCookie?.() ?? [value];
          void reply.header("set-cookie", cookies);
          return;
        }
        if (key === "content-length") {
          // The body may be re-serialized (envelope remap); let Fastify size it.
          return;
        }
        void reply.header(key, value);
      });
      const text = await res.text();
      if (res.status >= 400) {
        let parsed: { message?: string; code?: string } = {};
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { message: text };
        }
        const code = mapAuthError(parsed, res.status);
        // The envelope's status always follows the SRS catalog for the mapped
        // code (e.g. BA's 400 INVALID_OTP must surface as 401 OTP_INVALID).
        return reply.code(ERROR_STATUS[code]).send({
          error: { code, message: parsed.message ?? code, requestId: request.id },
        });
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (text.length > 0 && contentType.includes("application/json")) {
        return reply.send(JSON.parse(text));
      }
      return reply.send(text);
    });
  });


  app.setNotFoundHandler((request, reply) => {
    void reply.code(404);
    void reply.send({
      error: { code: "NOT_FOUND", message: "Resource not found", requestId: request.id },
    });
  });

  /* Idempotency enforcement (SRS 3.2) — routes arrive with PR step 3. */
  registerIdempotency(app, {
    routes: IDEMPOTENCY_ROUTES,
    getPrincipal: (request) => request.principal ?? null,
  });

  // SRS FR-INV-03: register the minute sweeper as a repeatable job (best-effort;
  // Redis-less deployments rely on an external cron hitting runSweeper()).
  void registerSweeperSchedule(env.redisUrl).catch(() => undefined);

  return {
    app,
    env,
    close: async () => {
      await closeLimiter();
      await app.close();
      await dbHandle.close();
    },
  };
}
