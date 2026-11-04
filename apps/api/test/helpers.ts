/**
 * Shared integration-test helpers.
 * Tests run against the REAL Postgres cluster (NFR-09): DATABASE_URL points
 * at the ephemeral pg@16 instance started by the test runner.
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql } from "@repo/db";
import { db, owners, users } from "@repo/db";
import { buildApp } from "../src/app.js";
import type { NotificationProvider, SendInput } from "../src/lib/types.js";

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://kayooh@127.0.0.1:5433/kayooh";

/** Captures every notification send (test seam for the OTP code). */
export class CapturingNotificationProvider implements NotificationProvider {
  readonly sends: SendInput[] = [];

  async send(input: SendInput): Promise<void> {
    this.sends.push(input);
  }

  /** The most recent OTP code sent to a phone. */
  lastOtp(phone: string): string {
    for (let i = this.sends.length - 1; i >= 0; i -= 1) {
      const s = this.sends[i];
      if (s.template === "otp" && s.to === phone) {
        return String(s.vars.code);
      }
    }
    throw new Error(`no OTP captured for ${phone}`);
  }
}

export interface TestApp {
  app: FastifyInstance;
  notifications: CapturingNotificationProvider;
  close(): Promise<void>;
}

export async function buildTestApp(): Promise<TestApp> {
  const notifications = new CapturingNotificationProvider();
  const { app, close } = await buildApp({
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: "test-secret-integration-only-0123456789abcdef",
    },
    notificationProvider: notifications,
  });
  return { app, notifications, close };
}

/** Wipes every table between tests (real-DB integration hygiene). */
export async function truncateAll(): Promise<void> {
  await db.execute(sql`
    DO $$ DECLARE t text;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('TRUNCATE TABLE %I CASCADE', t);
      END LOOP;
    END $$;
  `);
}

export interface SeedAdminResult {
  userId: string;
  email: string;
  password: string;
}

/** Seeds an admin account directly (users + credential account). */
export async function seedAdmin(
  email = "admin@kayooh.test",
  password = "correct-horse-battery-staple",
): Promise<SeedAdminResult> {
  const [user] = await db
    .insert(users)
    .values({ email, emailVerified: true, name: "admin", role: "admin" })
    .returning({ id: users.id });
  await db.execute(sql`
    INSERT INTO accounts (user_id, account_id, provider_id, password)
    VALUES (${user.id}, ${user.id}, 'credential', ${await hashPassword(password)})
  `);
  return { userId: user.id, email, password };
}

export interface SeedOwnerResult {
  ownerId: string;
  userId: string;
  email: string;
  password: string;
}

/** Seeds an owner account directly (owner + users + credential account). */
export async function seedOwner(
  email = "owner@kayooh.test",
  password = "correct-horse-battery-staple",
): Promise<SeedOwnerResult> {
  const [owner] = await db
    .insert(owners)
    .values({ name: "owner" })
    .returning({ id: owners.id });
  const [user] = await db
    .insert(users)
    .values({
      email,
      emailVerified: true,
      name: "owner",
      role: "owner",
      ownerId: owner.id,
    })
    .returning({ id: users.id });
  await db.execute(sql`
    INSERT INTO accounts (user_id, account_id, provider_id, password)
    VALUES (${user.id}, ${user.id}, 'credential', ${await hashPassword(password)})
  `);
  return { ownerId: owner.id, userId: user.id, email, password };
}

export interface SeedOutletResult {
  outletId: string;
  ownerId: string;
  code: string;
}

/** Seeds an owner + outlet (staff accounts require an outlet). */
export async function seedOutlet(code = "JMB-001"): Promise<SeedOutletResult> {
  const owner = await seedOwner(`owner-${code.toLowerCase()}@kayooh.test`);
  const { outlets } = await import("@repo/db");
  const [outlet] = await db
    .insert(outlets)
    .values({
      ownerId: owner.ownerId,
      code,
      name: `Outlet ${code}`,
      address: "Jl. Test No. 1, Jambi",
      lat: "-1.610000",
      lng: "103.613000",
      hours: { open: "08:00", close: "21:00" },
    })
    .returning({ id: outlets.id });
  return { outletId: outlet.id, ownerId: owner.ownerId, code };
}

/** Extracts the Better Auth session cookie from a Set-Cookie header. */
export function sessionCookie(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie.join("; ") : (setCookie ?? "");
  const pair = raw
    .split(",")
    .map((c) => c.trim())
    .find((c) => c.startsWith("better-auth.session_token="));
  if (!pair) throw new Error(`no session cookie in ${raw}`);
  return pair.split(";")[0];
}

export function newIdempotencyKey(): string {
  return randomUUID();
}
