/**
 * Verification routes (SRS endpoint table, FR-ID-04). Architecture init scaffold.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, validationError } from "../../lib/errors.js";
import type { Principal } from "../identity/guards.js";
import { requireRole } from "../identity/guards.js";
import { createVerificationProvider } from "./provider.js";

const uploadUrlSchema = z.object({}).strict();
const submitSchema = z
  .object({ documentType: z.enum(["ktp", "sim", "passport"]), documentKey: z.string().min(1) })
  .strict();

export function registerVerificationRoutes(app: FastifyInstance): void {
  // POST /renters/me/id-documents/upload-url — presigned PUT URL (skeleton).
  app.post("/api/v1/renters/me/id-documents/upload-url", { preHandler: requireRole("renter") }, async (request, reply) => {
    const principal: Principal | undefined = request.principal;
    if (!principal) throw new AppError("UNAUTHENTICATED");
    const parsed = uploadUrlSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);
    // Skeleton: returns a placeholder key; presigned URL wiring lands with storage.
    const key = `uploads/id/${crypto.randomUUID()}.jpg`;
    return reply.code(200).send({ uploadUrl: `https://storage.example/${key}`, key, expiresInSec: 300 });
  });

  // POST /renters/me/verification — submit document for review.
  app.post("/api/v1/renters/me/verification", { preHandler: requireRole("renter") }, async (request, reply) => {
    const principal: Principal | undefined = request.principal;
    if (!principal) throw new AppError("UNAUTHENTICATED");
    const parsed = submitSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const provider = createVerificationProvider({ nodeEnv: process.env.NODE_ENV ?? "development" });
    const result = await provider.submit({ documentType: parsed.data.documentType, documentKey: parsed.data.documentKey, renterId: principal.userId });
    void result;
    return reply.code(200).send({ status: "pending", providerRef: result.providerRef });
  });
}