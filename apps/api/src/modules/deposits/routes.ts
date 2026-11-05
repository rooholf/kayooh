/**
 * Deposit routes (SRS endpoint table, FR-ID-05).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { vIdr, vUuid } from "@repo/contracts";
import { db } from "@repo/db";
import { AppError, validationError } from "../../lib/errors.js";
import type { Principal } from "../identity/guards.js";
import { requireRole } from "../identity/guards.js";
import { topUpDeposit, releaseDeposit } from "./service.js";

function renterOnly(request: FastifyRequest): Principal {
  const principal: Principal | undefined = request.principal;
  if (!principal) throw new AppError("UNAUTHENTICATED");
  if (principal.role !== "renter") throw new AppError("FORBIDDEN");
  return principal;
}

export function registerDepositRoutes(app: FastifyInstance): void {
  app.post("/api/v1/renters/me/deposit", { preHandler: requireRole("renter") }, async (request, reply) => {
    const principal = renterOnly(request);
    const body = z.object({}).strict().safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error);
    const result = await topUpDeposit(db, principal.userId, request.headers["idempotency-key"] as string);
    void result;
    return reply.code(200).send({ paymentUrl: result.paymentUrl });
  });

  app.post("/api/v1/admin/renters/:id/deposit/release", { preHandler: requireRole("admin") }, async (request, reply) => {
    const params = z.object({ id: vUuid }).safeParse(request.params);
    if (!params.success) throw validationError(params.error);
    const body = z.object({ amountIdr: vIdr }).strict().safeParse(request.body);
    if (!body.success) throw validationError(body.error);
    const result = await releaseDeposit(db, params.data.id, BigInt(body.data.amountIdr));
    void result;
    return reply.code(200).send({ released: result.released });
  });
}