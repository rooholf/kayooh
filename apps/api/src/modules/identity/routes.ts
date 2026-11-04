/**
 * Identity routes (non-Better-Auth API surface).
 * FR-ID-01.7/FR-ID-02.4 resolved per request; role matrix per section 1.3.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { vEmail, vPassword, vUuid } from "@repo/contracts";
import { AppError } from "../../lib/errors.js";
import { requireRole } from "./guards.js";
import { createAdminUser, getRenterProfile } from "./service.js";

export function registerIdentityRoutes(app: FastifyInstance): void {
  /** GET /renters/me — own data only (section 1.3). */
  app.get("/api/v1/renters/me", { preHandler: requireRole("renter") }, async (request) => {
    const principal = request.principal!;
    const profile = await getRenterProfile(principal.userId);
    if (!profile) {
      // Renter row missing (provisioning anomaly) — do not leak existence.
      throw new AppError("NOT_FOUND");
    }
    return {
      phone: profile.phone,
      verificationStatus: profile.verificationStatus,
      depositStatus: profile.depositStatus,
      depositBalanceIdr: profile.depositBalanceIdr === null ? null : profile.depositBalanceIdr.toString(),
    };
  });

  /** POST /admin/users — admin-only provisioning (FR-ID-02.1). */
  app.post(
    "/api/v1/admin/users",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const Body = z
        .object({
          email: vEmail,
          password: vPassword,
          role: z.enum(["staff", "owner", "admin"]),
          outletId: vUuid.optional(),
          ownerId: vUuid.optional(),
        })
        .strict();
      const parsed = Body.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Invalid request body",
          parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => ({
            path: i.path.map(String).join("."),
            issue: i.message,
          })),
        );
      }
      const body = parsed.data;
      if (body.role === "staff" && !body.outletId) {
        throw new AppError("VALIDATION_ERROR", "outletId is required for staff", [
          { path: "outletId", issue: "required" },
        ]);
      }
      if (body.role === "owner" && !body.ownerId) {
        throw new AppError("VALIDATION_ERROR", "ownerId is required for owner", [
          { path: "ownerId", issue: "required" },
        ]);
      }
      const created = await createAdminUser({
        email: body.email,
        password: body.password,
        role: body.role,
        outletId: body.outletId,
        ownerId: body.ownerId,
        actorId: request.principal!.userId,
      });
      void reply.code(201);
      return { id: created.id, email: body.email, role: body.role };
    },
  );
}
