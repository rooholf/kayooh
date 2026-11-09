/**
 * DEV-ONLY payment auto-confirm (never registered in production).
 *
 *   POST /api/v1/dev/auto-pay   { reservationId }
 *
 * Test convenience: finds the reservation's awaiting-payment (`pending`) payment intent
 * and delivers a well-formed `PAID` event to the official fake-gateway webhook
 * (`POST /webhooks/fake`) via `app.inject` — so the booking runs through the
 * exact SRS FR-PAY-02 state machine (token check, idempotency, amount check,
 * `held` -> `confirmed`, refund-on-sold-out, outbox events, notifications).
 * A `dev-auto-<uuid>` event id keeps each delivery idempotent yet unique, so
 * repeated calls on an already-paid intent are a harmless re-delivery.
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq } from "@repo/db";
import { db, paymentIntents } from "@repo/db";
import { AppError, validationError } from "../../lib/errors.js";
import { FIXTURE_WEBHOOK_HEADER } from "./gateway.js";

const bodySchema = z.object({ reservationId: z.string().uuid() }).strict();

export function registerDevRoutes(
  app: FastifyInstance,
  opts: { nodeEnv: string; webhookSecret: string },
): void {
  if (opts.nodeEnv === "production") return;

  app.post<{ Body: unknown }>("/api/v1/dev/auto-pay", async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);

    // The hold creates the intent as `created`, then flips it to `pending`
    // once the gateway invoice exists (reservation-hold FR-INV-02 post-commit).
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.reservationId, parsed.data.reservationId),
          eq(paymentIntents.status, "pending"),
        ),
      )
      .limit(1);
    if (!intent) {
      throw new AppError(
        "NOT_FOUND",
        "No awaiting-payment intent for this reservation (already paid, expired, or unknown).",
      );
    }

    const injected = await app.inject({
      method: "POST",
      url: "/webhooks/fake",
      headers: { [FIXTURE_WEBHOOK_HEADER]: opts.webhookSecret },
      payload: {
        event_id: `dev-auto-${randomUUID()}`,
        external_id: intent.id,
        status: "PAID",
        paid_amount: Number(intent.amountIdr),
      },
    });

    let webhookBody: unknown = null;
    try {
      webhookBody = injected.json();
    } catch {
      webhookBody = injected.body;
    }
    return reply.code(200).send({
      reservationId: parsed.data.reservationId,
      intentId: intent.id,
      amountIdr: Number(intent.amountIdr),
      webhookStatus: injected.statusCode,
      webhookBody,
    });
  });
}
