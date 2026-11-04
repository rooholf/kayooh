/**
 * Session resolution and role guards (FR-ID-02.3 / FR-ID-02.4 / section 1.3).
 *
 * Every request resolves role, owner_id, outlet_id from the session.
 * Per-role ABSOLUTE, non-sliding TTLs are enforced here on top of BA's
 * renter-oriented 30 d session:
 *   staff 12 h, owner 7 d, admin 8 h (renter uses the BA default).
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";

export interface Principal {
  userId: string;
  role: "renter" | "staff" | "owner" | "admin";
  ownerId: string | null;
  outletId: string | null;
  sessionId: string;
  sessionCreatedAt: Date;
}

/** BA getSession result shape ({ session, user } | null). */
export interface BaSession {
  session: {
    id: string;
    token: string;
    createdAt: Date;
    expiresAt: Date;
    userId: string;
  };
  user: {
    id: string;
    role: string;
    ownerId?: string | null;
    outletId?: string | null;
  };
}

export type GetSessionFn = (headers: Headers) => Promise<BaSession | null>;

/** Absolute, non-sliding TTLs in seconds (FR-ID-02.3). */
export const ROLE_TTL_SECONDS: Record<Principal["role"], number | null> = {
  renter: null, // BA session handles the 30 d sliding TTL
  staff: 12 * 60 * 60,
  owner: 7 * 24 * 60 * 60,
  admin: 8 * 60 * 60,
};

function toPrincipal(result: BaSession): Principal {
  const role = result.user.role as Principal["role"];
  return {
    userId: result.user.id,
    role,
    ownerId: result.user.ownerId ?? null,
    outletId: result.user.outletId ?? null,
    sessionId: result.session.id,
    sessionCreatedAt: result.session.createdAt,
  };
}

function toFetchHeaders(
  input: Record<string, string | string[] | undefined>,
): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") h.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
  }
  return h;
}

/**
 * Resolves the caller's session into a Principal, enforcing the absolute
 * role TTL. Unauthenticated -> null (routes then 401). Staff/owner/admin
 * whose absolute TTL lapsed are 401 (session treated as expired).
 */
export async function resolvePrincipal(
  request: FastifyRequest,
  getSession: GetSessionFn,
): Promise<Principal | null> {
  const result = await getSession(toFetchHeaders(request.headers));
  if (!result?.user || !result.session) return null;
  const principal = toPrincipal(result);
  const ttl = ROLE_TTL_SECONDS[principal.role];
  if (ttl !== null) {
    const ageSeconds = (Date.now() - principal.sessionCreatedAt.getTime()) / 1000;
    if (ageSeconds > ttl) {
      throw new AppError("UNAUTHENTICATED", "Session expired for role");
    }
  }
  return principal;
}

/** preHandler factory: requires an authenticated caller with one of the roles. */
export function requireRole(...roles: Array<Principal["role"]>) {
  return async function requireRoleGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const principal = request.principal;
    if (!principal) {
      throw new AppError("UNAUTHENTICATED");
    }
    if (roles.length > 0 && !roles.includes(principal.role)) {
      // Section 1.3 permission matrix. Resources outside the caller's scope
      // return 404 in the resource routes (SRS 3.2); this guard is for
      // role-gated endpoint groups.
      throw new AppError("FORBIDDEN");
    }
  };
}
