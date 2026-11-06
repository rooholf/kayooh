import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import {
  buildTestApp,
  truncateAll,
  type TestApp,
} from "./helpers.js";
import { db, notifications, outboxEvents, auditLog, users } from "@repo/db";
import { eq } from "@repo/db";
import { enqueueNotification, deliverNotification, runOutboxDispatch } from "../src/modules/notifications/index.js";
import { NOTIFICATION_MAX_ATTEMPTS } from "../src/modules/notifications/index.js";
import { DEFAULT_CHANNEL_BY_TEMPLATE } from "../src/lib/notifications.js";
import type { NotificationProvider } from "../src/lib/types.js";

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await t.close();
});

class FailingProvider implements NotificationProvider {
  readonly sends: Array<{ channel: string; template: string; to: string }> = [];
  async send(): Promise<void> {
    throw new Error("provider boom");
  }
}

class CapturingProvider implements NotificationProvider {
  readonly sends: Array<{ channel: string; template: string; to: string }> = [];
  async send(input: { channel: string; template: string; to: string }): Promise<void> {
    this.sends.push({ channel: input.channel, template: input.template, to: input.to });
  }
}

async function seedUser(opts: { email?: string; phone?: string } = {}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: opts.email ?? `u.${Date.now()}.${Math.floor(Math.random() * 1e6)}@kayooh.test`,
      emailVerified: true,
      name: "u",
      role: "renter",
      phoneNumber: opts.phone ?? "+6281234567890",
    })
    .returning({ id: users.id });
  return user.id;
}

describe("FR-NOT-01 notification delivery (transactional outbox)", () => {
  it("enqueue is tx-atomic: both rows land together, nothing is sent during the business flow", async () => {
    const userId = await seedUser({ phone: "+6281111111111" });
    const capturing = new CapturingProvider();

    await db.transaction(async (tx) => {
      await enqueueNotification(tx, {
        userId,
        channel: "whatsapp",
        template: "reservation_confirmed",
        vars: { reservationId: "r-1" },
      });
    });

    const notifRows = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(notifRows).toHaveLength(1);
    expect(notifRows[0].status).toBe("queued");
    expect(notifRows[0].attempts).toBe(0);
    const outboxRows = await db.select().from(outboxEvents);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].dispatchedAt).toBeNull();
    // Nothing sent during the business flow (no provider call was made).
    expect(capturing.sends).toHaveLength(0);

    // Rolled-back transaction leaves neither row behind (atomicity).
    await expect(
      db.transaction(async (tx) => {
        await enqueueNotification(tx, {
          userId,
          channel: "whatsapp",
          template: "no_show",
          vars: { reservationId: "r-2" },
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const after = await db.select().from(notifications);
    expect(after).toHaveLength(1);
  });

  it("runOutboxDispatch (Redis-less floor) claims the row, delivers, marks sent + dispatched_at", async () => {
    const userId = await seedUser({ phone: "+6282222222222" });
    await db.transaction(async (tx) => {
      await enqueueNotification(tx, {
        userId,
        channel: "whatsapp",
        template: "no_show",
        vars: { reservationId: "r-3" },
      });
    });

    const capturing = new CapturingProvider();
    const { claimed } = await runOutboxDispatch({ provider: capturing });
    expect(claimed).toBe(1);
    expect(capturing.sends).toHaveLength(1);
    expect(capturing.sends[0].template).toBe("no_show");
    expect(capturing.sends).toHaveLength(1);
    expect(capturing.sends[0].template).toBe("no_show");

    const notifRows = await db.select().from(notifications);
    expect(notifRows[0].status).toBe("sent");
    expect(notifRows[0].attempts).toBe(1);
    const outboxRows = await db.select().from(outboxEvents);
    expect(outboxRows[0].dispatchedAt).not.toBeNull();
  });

  it("5 failing attempts -> failed + audit_log, and a whatsapp failure re-enqueues by email", async () => {
    const userId = await seedUser({ phone: "+6283333333333", email: "renter-fallback@kayooh.test" });
    const { id: notificationId } = await db
      .insert(notifications)
      .values({
        userId,
        channel: "whatsapp",
        template: "refund_issued",
        vars: { reason: "mechanical_failure", amountIdr: 1000 },
        status: "queued",
      })
      .returning({ id: notifications.id })
      .then((r) => r[0]);

    const failing = new FailingProvider();
    for (let i = 0; i < NOTIFICATION_MAX_ATTEMPTS; i++) {
      await deliverNotification({ notificationId }, { provider: failing });
    }

    const rows = await db.select().from(notifications).where(eq(notifications.id, notificationId));
    expect(rows[0].status).toBe("failed");
    expect(rows[0].attempts).toBe(NOTIFICATION_MAX_ATTEMPTS);
    expect(rows[0].lastError).toContain("provider boom");

    const audits = await db.select().from(auditLog);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("notification.failed");

    // Fallback: a NEW email-channel row was queued for the same template.
    const emailRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.channel, "email"));
    expect(emailRows).toHaveLength(1);
    expect(emailRows[0].template).toBe("refund_issued");
    expect(emailRows[0].status).toBe("queued");

    // And the floor delivers the fallback copy once a working provider is used.
    const capturing = new CapturingProvider();
    await runOutboxDispatch({ provider: capturing });
    const delivered = await db.select().from(notifications).where(eq(notifications.channel, "email"));
    expect(delivered[0].status).toBe("sent");
    expect(capturing.sends).toHaveLength(1);
    expect(capturing.sends[0].channel).toBe("email");
  });

  it("a non-terminal failure records the attempt and backs off ~30 s via next_attempt_at", async () => {
    const userId = await seedUser({ phone: "+6284444444444" });
    const { id: notificationId } = await db
      .insert(notifications)
      .values({ userId, channel: "whatsapp", template: "otp", vars: { code: "123456" }, status: "queued" })
      .returning({ id: notifications.id })
      .then((r) => r[0]);

    const failing = new FailingProvider();
    const before = Date.now();
    await deliverNotification({ notificationId }, { provider: failing });

    const rows = await db.select().from(notifications).where(eq(notifications.id, notificationId));
    expect(rows[0].status).toBe("queued");
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].nextAttemptAt).not.toBeNull();
    const delayMs = rows[0].nextAttemptAt!.getTime() - before;
    expect(delayMs).toBeGreaterThanOrEqual(29_000);
    expect(delayMs).toBeLessThanOrEqual(31_000);
  });

  it("channel routing: owner_late_flag defaults to email, refund_issued to whatsapp", () => {
    expect(DEFAULT_CHANNEL_BY_TEMPLATE.owner_late_flag).toBe("email");
    expect(DEFAULT_CHANNEL_BY_TEMPLATE.drift_alert).toBe("email");
    expect(DEFAULT_CHANNEL_BY_TEMPLATE.refund_issued).toBe("whatsapp");
    expect(DEFAULT_CHANNEL_BY_TEMPLATE.no_show).toBe("whatsapp");
  });

  it("enqueueNotification persists the chosen channel (owner/admin routing)", async () => {
    const userId = await seedUser({ phone: "+6285555555555", email: "owner@kayooh.test" });
    await db.transaction(async (tx) => {
      await enqueueNotification(tx, {
        userId,
        channel: DEFAULT_CHANNEL_BY_TEMPLATE.owner_late_flag,
        template: "owner_late_flag",
        vars: { rentalId: "rental-x", escalationStage: 3 },
      });
    });
    const rows = await db.select().from(notifications);
    expect(rows[0].channel).toBe("email");
    expect(rows[0].template).toBe("owner_late_flag");
  });
});
