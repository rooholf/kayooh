/**
 * FR-REP-02 — Server-Sent Events over the real transport semantics:
 *   1. AC: committing a check-out emits `bike_state` (and `rental`) to the
 *      owner stream of THAT owner only; the other owner's stream stays silent.
 *   2. A committed reservation hold emits `availability` on the public
 *      outlets stream within the NFR-01 window (< 2 s).
 *   3. A stream request without a session returns 401.
 *
 * The Redis-less test path uses the bus's in-process fallback (initSseBus
 * without REDIS_URL) — the same route/subscription/producer code as the
 * Redis pub/sub path; only the transport differs.
 */
import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import {
  buildTestApp,
  truncateAll,
  sessionCookie,
  seedOwner,
  type TestApp,
} from "./helpers.js";
import { randomUUID } from "node:crypto";
import {
  checkoutEvent,
  seedConfirmedReservation,
  seedOffering,
  seedRenter,
  seedStaff,
  staffSessionCookie,
} from "./staff.helpers.js";

let t: TestApp;
let baseUrl = "http://127.0.0.1:0";

beforeAll(async () => {
  t = await buildTestApp();
  await t.app.listen({ port: 0, host: "127.0.0.1" });
  const addr = t.app.server.address();
  if (typeof addr === "object" && addr) baseUrl = `http://127.0.0.1:${addr.port}`;
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await t.app.close();
  await t.close();
});

/* ------------------------------------------------------------------ */
/* SSE collector (real HTTP fetch stream)                              */
/* ------------------------------------------------------------------ */

interface SseCollector {
  events: Array<{ type: string; data: Record<string, unknown> }>;
  /** Resolves once the first bytes (retry hint) reached the client. */
  ready: Promise<void>;
  close(): void;
}

function openSseCollector(url: string, cookie?: string): Promise<SseCollector> {
  const controller = new AbortController();
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  let buf = "";
  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => (resolveReady = resolve));

  const parseFrames = (): void => {
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = frame.split("\n");
      const event = lines.find((l) => l.startsWith("event: "))?.slice("event: ".length);
      const data = lines.find((l) => l.startsWith("data: "))?.slice("data: ".length);
      if (event && data) {
        try {
          events.push({ type: event, data: JSON.parse(data) as Record<string, unknown> });
        } catch {
          // malformed frame: ignore, stream stays open
        }
      }
    }
    if (buf.length > 0) {
      resolveReady();
      resolveReady = () => undefined; // first-bytes latch only
    }
  };

  void (async () => {
    try {
      const res = await fetch(`${baseUrl}${url}`, {
        headers: cookie ? { cookie } : {},
        signal: controller.signal,
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.length > 0) {
          resolveReady();
          resolveReady = () => undefined;
        }
        parseFrames();
      }
    } catch {
      // aborted (close()) or the test app shut down — normal end
    }
  })();

  return Promise.resolve({
    events,
    ready,
    close: () => controller.abort(),
  });
}

async function ownerSessionCookie(email: string, password: string): Promise<string> {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email, password },
  });
  if (res.statusCode !== 200) throw new Error(`owner sign-in failed (${res.statusCode}): ${res.body}`);
  return sessionCookie(res.headers["set-cookie"]);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

const STAFF_EMAIL = "staff-sse@kayooh.test";
const STAFF_PASSWORD = "staff-password-sse-x";

describe("FR-REP-02 Server-Sent Events", () => {
  it("AC: committing a check-out emits bike_state (+ rental) to that owner's stream only", async () => {
    // Owner A (the offering) and owner B (unrelated, must receive nothing).
    const ownerA = await seedOwner(`owner-a.${randomUUID()}@kayooh.test`, "owner-password-a");
    const ownerB = await seedOwner(`owner-b.${randomUUID()}@kayooh.test`, "owner-password-b");
    const partner = await seedOffering(1, "commuter", { ownerId: ownerA.ownerId });
    await seedOffering(1, "commuter", { ownerId: ownerB.ownerId });

    const renter = await seedRenter();
    const window = { startsAt: new Date(Math.ceil((Date.now() + 20 * 60_000) / 900_000) * 900_000).toISOString(), endsAt: "" };
    const endsAt = new Date(new Date(window.startsAt).getTime() + 60 * 60_000).toISOString();
    const confirmed = await seedConfirmedReservation({
      userId: renter.userId,
      outletId: partner.outletId,
      category: "commuter",
      window: { startsAt: window.startsAt, endsAt },
    });

    const staff = await seedStaff(STAFF_EMAIL, STAFF_PASSWORD, partner.outletId);
    const staffCookie = await staffSessionCookie(t, staff);
    const ownerACookie = await ownerSessionCookie(ownerA.email, ownerA.password);
    const ownerBCookie = await ownerSessionCookie(ownerB.email, ownerB.password);

    // Streams open BEFORE the committing action (delivery < 2 s, NFR-01).
    const outletsStream = await openSseCollector("/api/v1/outlets/stream");
    const ownerAStream = await openSseCollector("/api/v1/owner/stream", ownerACookie);
    const ownerBStream = await openSseCollector("/api/v1/owner/stream", ownerBCookie);
    await Promise.all([outletsStream.ready, ownerAStream.ready, ownerBStream.ready]);

    try {
      const event = await checkoutEvent({
        reservationId: confirmed.reservationId,
        bikeAssetTags: [partner.bikeTags[0]!],
        occurredAt: new Date(new Date(window.startsAt).getTime() + 60_000).toISOString(),
      });
      const res = await t.app.inject({
        method: "POST",
        url: "/api/v1/staff/events",
        headers: { cookie: staffCookie },
        payload: event,
      });
      expect(res.statusCode).toBe(200);
      const verdictBody = res.json() as { status: string; results?: Array<{ status: string }> };
      expect(verdictBody.results?.[0]?.status ?? verdictBody.status).toBe("applied");

      // Owner A gets bike_state + rental within the NFR-01 window.
      await expect.poll(() => ownerAStream.events.find((e) => e.type === "bike_state"), { timeout: 2_000 }).toBeTruthy();
      const bikeState = ownerAStream.events.find((e) => e.type === "bike_state")!
        .data as unknown as { outletId: string; bikeAssetTag: string; state: string };
      expect(bikeState.outletId).toBe(partner.outletId);
      expect(bikeState.bikeAssetTag).toBe(partner.bikeTags[0]);
      expect(bikeState.state).toBe("in_rental");
      const rental = ownerAStream.events.find((e) => e.type === "rental")
        ?.data as unknown as { rentalId: string; state: string };
      expect(rental.rentalId).toBeTruthy();
      expect(rental.state).toBe("open");

      // The public outlets stream sees the availability recomputation.
      await expect.poll(() => outletsStream.events.find((e) => e.type === "availability"), { timeout: 2_000 }).toBeTruthy();
      const availability = outletsStream.events.find((e) => e.type === "availability")!
        .data as unknown as { outletId: string; category: string; availableNow: number };
      expect(availability.outletId).toBe(partner.outletId);
      expect(availability.category).toBe("commuter");
      // Buffer 0, 1 bike, one open rental -> 0 available now.
      expect(availability.availableNow).toBe(0);

      // Owner B's stream stays silent.
      await new Promise((r) => setTimeout(r, 400));
      expect(ownerBStream.events).toHaveLength(0);
    } finally {
      outletsStream.close();
      ownerAStream.close();
      ownerBStream.close();
    }
  });

  it("a committed reservation hold emits availability on the outlets stream", async () => {
    const partner = await seedOffering(1);
    const renter = await seedRenter();
    // Instant mode (default): SRS availability for every offering.
    const instantStream = await openSseCollector("/api/v1/outlets/stream");
    // Slot-mirroring mode: the renter's chosen window — the same window the
    // reservation will be seeded into, so the count must go to 0.
    const startsAt = new Date(Math.ceil((Date.now() + 20 * 60_000) / 900_000) * 900_000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const slotStream = await openSseCollector(
      `/api/v1/outlets/stream?outletId=${partner.outletId}&category=commuter&startsAt=${encodeURIComponent(startsAt.toISOString())}&endsAt=${encodeURIComponent(endsAt.toISOString())}`,
    );
    await instantStream.ready;
    await slotStream.ready;

    try {
      await seedConfirmedReservation({
        userId: renter.userId,
        outletId: partner.outletId,
        category: "commuter",
        window: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
      });

      // Instant mode: 1 bike in service; the FUTURE window does not occupy now.
      await expect.poll(() => instantStream.events.find((e) => e.type === "availability"), { timeout: 2_000 }).toBeTruthy();
      const instant = instantStream.events.find((e) => e.type === "availability")!
        .data as unknown as { outletId: string; category: string; availableNow: number };
      expect(instant.outletId).toBe(partner.outletId);
      expect(instant.category).toBe("commuter");
      expect(instant.availableNow).toBe(1);

      // Slot-mirroring: the chosen window IS occupied by the committed hold.
      await expect.poll(() => slotStream.events.find((e) => e.type === "availability"), { timeout: 2_000 }).toBeTruthy();
      const slot = slotStream.events.find((e) => e.type === "availability")!
        .data as unknown as { outletId: string; availableNow: number; window?: { startsAt: string; endsAt: string } };
      expect(slot.availableNow).toBe(0);
      expect(slot.window?.startsAt).toBe(startsAt.toISOString());
    } finally {
      instantStream.close();
      slotStream.close();
    }
  });

  it("401 on the owner stream without a session", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/owner/stream" });
    expect(res.statusCode).toBe(401);
  });
});
