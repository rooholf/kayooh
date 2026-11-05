import Dexie, { type EntityTable } from "dexie";

/** The five staff actions (SRS FR-OFF-01.1). */
export type EventType =
  | "checkout"
  | "checkin"
  | "inspection"
  | "bike_status_change"
  | "incident";

/** Local queue state, then the server verdict once it is known (FR-OFF-01.3). */
export type EventStatus = "pending" | "syncing" | "applied" | "flagged" | "rejected";

export type BikeState =
  | "available"
  | "held"
  | "reserved"
  | "in_rental"
  | "pending_inspection"
  | "maintenance"
  | "unavailable"
  | "charging";

export interface ScanEventPayload {
  bikeAssetTag?: string;
  voucherToken?: string;
  renterPhoneMasked?: string;
  note?: string;
  toState?: BikeState;
  checklist?: Record<string, boolean>;
  photoKeys?: string[];
}

/**
 * One staff action, recorded on the device and replayed idempotently.
 * `clientEventId` is the idempotency key; `occurredAt` is device time in UTC
 * and is the authority for every time-based rule (never receipt time).
 */
export interface ScanEvent {
  id?: number;
  clientEventId: string;
  type: EventType;
  occurredAt: string;
  payload: ScanEventPayload;
  status: EventStatus;
  reason?: string;
  attempts: number;
  lastAttemptAt?: string;
  /** Server receipt time, set once the server has acknowledged the event. */
  receivedAt?: string;
  /** True for authored demo rows; the UI labels them as sample data. */
  synthetic?: boolean;
}

/** FR-OFF-01.1: queue capacity; past this the UI blocks new scans. */
export const QUEUE_CAPACITY = 500;

/** FR-OFF-01.4: a batch carries at most 50 events. */
export const BATCH_LIMIT = 50;

class StaffDb extends Dexie {
  scanEvents!: EntityTable<ScanEvent, "id">;

  constructor() {
    super("kayooh-staff");
    this.version(1).stores({
      // `&clientEventId` is unique, so a replay can never double-store.
      scanEvents: "++id, &clientEventId, status, occurredAt, type",
    });
  }
}

export const db = new StaffDb();

/** An event waiting for (or in the middle of) a server acknowledgement. */
export function isQueued(event: ScanEvent): boolean {
  return event.status === "pending" || event.status === "syncing";
}

/** New UUID v4 — the client event id (SRS V-CLIENT-EVENT-ID). */
export function newClientEventId(): string {
  return crypto.randomUUID();
}

export interface EnqueueInput {
  type: EventType;
  payload: ScanEventPayload;
  /** Device time; defaults to now. Captured before the network is touched. */
  occurredAt?: string;
  synthetic?: boolean;
}

/** FR-OFF-01.1 step one: write the event to IndexedDB, then let sync send it. */
export async function enqueueEvent(input: EnqueueInput): Promise<ScanEvent> {
  const event: ScanEvent = {
    clientEventId: newClientEventId(),
    type: input.type,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: input.payload,
    status: "pending",
    attempts: 0,
    ...(input.synthetic ? { synthetic: true } : {}),
  };
  const id = await db.scanEvents.add(event);
  return { ...event, id };
}

/**
 * The queue's depth: events the server has not acknowledged yet.
 * FR-OFF-01.1 — at QUEUE_CAPACITY the counter blocks new scans.
 */
export function queuedCount(): Promise<number> {
  return db.scanEvents.where("status").anyOf("pending", "syncing").count();
}

/** Events in `occurredAt` order — the order the server must apply them in. */
export function listEvents(limit?: number): Promise<ScanEvent[]> {
  const coll = db.scanEvents.orderBy("occurredAt");
  return limit === undefined ? coll.toArray() : coll.limit(limit).toArray();
}

/**
 * Claim the next batch for sending: the oldest `pending` events by `occurredAt`,
 * marked `syncing` and with their attempt count raised (FR-OFF-01.1/2).
 */
export async function claimBatch(limit = BATCH_LIMIT): Promise<ScanEvent[]> {
  return db.transaction("rw", db.scanEvents, async () => {
    const claimed = await db.scanEvents
      .where("status")
      .equals("pending")
      .sortBy("occurredAt");
    const batch = claimed.slice(0, limit);
    const now = new Date().toISOString();
    await Promise.all(
      batch.map((e) =>
        db.scanEvents.update(e.id as number, {
          status: "syncing",
          attempts: e.attempts + 1,
          lastAttemptAt: now,
        }),
      ),
    );
    return batch.map((e) => ({
      ...e,
      status: "syncing" as const,
      attempts: e.attempts + 1,
      lastAttemptAt: now,
    }));
  });
}

/** Undo a claim after a failed send, so the events stay queued. */
export async function releaseBatch(clientEventIds: string[]): Promise<void> {
  if (clientEventIds.length === 0) return;
  await db.transaction("rw", db.scanEvents, async () => {
    await Promise.all(
      clientEventIds.map(async (clientEventId) => {
        const row = await db.scanEvents.where("clientEventId").equals(clientEventId).first();
        if (row?.id !== undefined && row.status === "syncing") {
          await db.scanEvents.update(row.id, { status: "pending" });
        }
      }),
    );
  });
}

export interface ServerVerdict {
  clientEventId: string;
  status: "applied" | "flagged" | "rejected";
  reason?: string;
}

/**
 * Write the server's per-event verdicts back (FR-OFF-01.2/3). Any claimed
 * event the server did not answer for is returned to the queue untouched.
 */
export async function settleBatch(
  claimedIds: string[],
  verdicts: ServerVerdict[],
): Promise<void> {
  const byId = new Map(verdicts.map((v) => [v.clientEventId, v]));
  const receivedAt = new Date().toISOString();
  await db.transaction("rw", db.scanEvents, async () => {
    await Promise.all(
      claimedIds.map(async (clientEventId) => {
        const row = await db.scanEvents.where("clientEventId").equals(clientEventId).first();
        if (row?.id === undefined) return;
        const verdict = byId.get(clientEventId);
        if (!verdict) {
          if (row.status === "syncing") await db.scanEvents.update(row.id, { status: "pending" });
          return;
        }
        await db.scanEvents.update(row.id, {
          status: verdict.status,
          receivedAt,
          ...(verdict.reason !== undefined ? { reason: verdict.reason } : {}),
        });
      }),
    );
  });
}
