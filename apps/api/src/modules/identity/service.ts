/**
 * Identity service: admin user provisioning (FR-ID-02.1) and renter profile.
 * Public sign-up for staff/owner/admin is disabled — accounts are created
 * only here (admin-authenticated route calls this).
 */
import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  accounts as accountsTable,
  db,
  eq,
  outlets,
  owners,
  renters,
  users,
} from "@repo/db";
import { AppError } from "../../lib/errors.js";
import { recordAudit } from "../audit/index.js";

export interface CreateAdminUserInput {
  email: string; // normalized (V-EMAIL)
  password: string; // V-PASSWORD validated by the route schema
  role: "staff" | "owner" | "admin";
  outletId?: string; // required for staff
  ownerId?: string; // required for owner
  actorId: string; // admin performing the mutation (audit)
}

/**
 * Creates a staff/owner/admin account: users row + BA credential account row
 * with the hashed password, atomically; audit logged (FR-SEC-02.1).
 * Public sign-up cannot create these roles (emailAndPassword.disableSignUp).
 */
export async function createAdminUser(input: CreateAdminUserInput): Promise<{ id: string }> {
  if (input.role === "staff") {
    if (!input.outletId) throw new AppError("VALIDATION_ERROR", "outletId is required for staff");
    const outlet = await db.select({ id: outlets.id }).from(outlets).where(eq(outlets.id, input.outletId)).limit(1);
    if (outlet.length === 0) throw new AppError("NOT_FOUND", "outletId does not exist");
  }
  if (input.role === "owner") {
    if (!input.ownerId) throw new AppError("VALIDATION_ERROR", "ownerId is required for owner");
    const owner = await db.select({ id: owners.id }).from(owners).where(eq(owners.id, input.ownerId)).limit(1);
    if (owner.length === 0) throw new AppError("NOT_FOUND", "ownerId does not exist");
  }

  try {
    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (existing.length > 0) {
        throw new AppError("DUPLICATE_RESOURCE", "email already exists");
      }
      const inserted = await tx
        .insert(users)
        .values({
          email: input.email,
          emailVerified: true, // admin-created; email known-good at provisioning
          name: input.email.split("@")[0],
          role: input.role,
          ownerId: input.ownerId ?? null,
          outletId: input.outletId ?? null,
        })
        .returning({ id: users.id });
      const user = inserted[0];
      if (!user) throw new AppError("INTERNAL", "user insert returned no row");
      await tx.insert(accountsTable).values({
        userId: user.id,
        accountId: user.id, // credential provider convention
        providerId: "credential",
        password: await hashPassword(input.password),
      });
      return { id: user.id };
    });
    await recordAudit({
      actorId: input.actorId,
      actorRole: "admin",
      action: "user.create",
      entity: "users",
      entityId: result.id,
      after: { email: input.email, role: input.role, outletId: input.outletId, ownerId: input.ownerId },
    });
    return result;
  } catch (e) {
    if (e instanceof AppError) throw e;
    // Unique violation from a concurrent creation race.
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") {
      throw new AppError("DUPLICATE_RESOURCE", "email already exists");
    }
    throw e;
  }
}

export interface RenterProfile {
  phone: string | null;
}

/** GET /renters/me backing query (own data only — section 1.3). */
export async function getRenterProfile(userId: string): Promise<RenterProfile | null> {
  const rows = await db
    .select({
      phone: users.phoneNumber,
    })
    .from(renters)
    .innerJoin(users, eq(users.id, renters.userId))
    .where(eq(renters.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    phone: row.phone,
  };
}

// Local import to avoid a top-level cycle in schema re-exports.
export { verifyPassword };
