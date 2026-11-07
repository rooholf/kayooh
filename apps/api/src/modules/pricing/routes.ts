/**
 * POST /pricing/quote  (SRS 7.1 endpoint table + FR-PRC-01)
 *
 * SKILL implement_zod_contract_route scope:
 *   1. .strict() body/response schemas from @repo/contracts
 *      (quoteBodySchema / quoteResponseSchema)
 *   2. this Fastify route
 *   3. Zod failures -> 400 VALIDATION_ERROR via validationError().
 *
 * Public preview: no session is required and nothing is persisted. The quote
 * is per bike (FR-PRC-01.2 — `priceIdr = rateIdr * units`), so the response
 * adds `units` and the online 50% down payment `dpIdr`
 * (`roundHalfUp(finalIdr * booking.dp_rate_bps / 10000)`, INV-5 integer bigint).
 *
 * Revision 1.2 (incentivized auth): a `promoCode` requires a session — an
 * unauthenticated request supplying one is 401 `UNAUTHENTICATED`. With a
 * session, P1's `quote()` still rejects any promo 422 `PROMO_INVALID` (the
 * promotions engine is P2, FR-PRC-01.3).
 */
import type { FastifyInstance } from "fastify";
import { db } from "@repo/db";
import { quoteBodySchema, quoteResponseSchema, type QuoteResponse } from "@repo/contracts";
import { AppError, validationError } from "../../lib/errors.js";
import { getConfig } from "../app-config/index.js";
import { computeUnits, quote } from "./index.js";

/** INV-5: half-up division on non-negative bigints (no floating point). */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function registerPricingRoutes(app: FastifyInstance): void {
  app.post<{ Body: unknown }>("/api/v1/pricing/quote", async (request, reply) => {
    const parsed = quoteBodySchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const body = parsed.data;

    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new AppError("DURATION_OUT_OF_RANGE", "endsAt must be after startsAt.");
    }

    // Incentivized auth (revision 1.2): promotions need an account.
    if (body.promoCode !== undefined && !request.principal) {
      throw new AppError("UNAUTHENTICATED", "Promotions require an account; sign in to apply a promo code.");
    }

    // FR-PRC-01 rate lookup + integer math; throws CATEGORY_NOT_OFFERED /
    // PROMO_INVALID / AMOUNT_BELOW_MINIMUM as the shared catalog defines.
    const q = await quote(db, {
      outletId: body.outletId,
      category: body.category,
      startsAt,
      endsAt,
      promoCode: body.promoCode,
    });

    const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
    const units = computeUnits(durationMinutes, q.unitMinutes);
    const dpRateBps = BigInt(await getConfig("booking.dp_rate_bps"));
    const dpIdr = roundHalfUp(BigInt(q.finalIdr) * dpRateBps, 10_000n);

    const response: QuoteResponse = quoteResponseSchema.parse({
      priceIdr: q.priceIdr,
      discountIdr: q.discountIdr,
      finalIdr: q.finalIdr,
      dpIdr: Number(dpIdr),
      units,
    });

    return reply.code(200).send(response);
  });
}
