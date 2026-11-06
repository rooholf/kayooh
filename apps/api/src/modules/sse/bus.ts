/**
 * FR-REP-02 pub/sub bridge. Producers push domain events onto the bus AFTER
 * commit (never inside the transaction); the two stream endpoints subscribe
 * and fan out to connected clients.
 *
 * Transport:
 *   - REDIS_URL set (production, single-deployable NEG-6): Redis pub/sub is
 *     the cross-instance fan-out on the same Redis server BullMQ uses — but
 *     with a DEDICATED client pair (publisher + subscriber), because pub/sub
 *     wedges a connection into subscribe mode and BullMQ owns its own
 *     connections anyway. The whole instance receives every event back
 *     through Redis: exactly one delivery path, no local re-broadcast.
 *   - REDIS_URL unset (dev/test): an in-process EventEmitter is the bus.
 *
 * Channel model (the server-side owner filter, FR-REP-02.2):
 *   `sse:public`        — availability events, anonymous outlets stream
 *   `sse:owner:<id>`    — rental/bike_state events, one channel per owner
 *
 * NOTE on the inventory import: `availability.js` is imported directly, not
 * through `../inventory/index.js`, because that index re-exports the
 * reservation-hold (an SSE producer) and would create an import cycle.
 */
import { EventEmitter } from "node:events";
import IORedis, { type Redis } from "ioredis";
import { availableNow, type QueryExecutor } from "../inventory/availability.js";

const PUBLIC_CHANNEL = "sse:public";

/** Owner-scoped channel: the server-side owner filter (FR-REP-02.2). */
export const ownerChannel = (ownerId: string): string => `sse:owner:${ownerId}`;

export type AvailabilityEvent = {
  type: "availability";
  outletId: string;
  category: string;
  availableNow: number;
};

export type OwnerEvent =
  | {
      type: "rental";
      outletId: string;
      rentalId: string;
      state: string;
    }
  | {
      type: "bike_state";
      outletId: string;
      bikeAssetTag: string;
      state: string;
    };

export type SseOutboundEvent = AvailabilityEvent | OwnerEvent;

interface BusState {
  publisher: Redis | null;
  subscriber: Redis | null;
  emitter: EventEmitter;
  /** channel -> subscribers (both transports share this registry). */
  channelSubscribers: Map<string, Set<(event: SseOutboundEvent) => void>>;
}

const bus: BusState = {
  publisher: null,
  subscriber: null,
  emitter: new EventEmitter(),
  channelSubscribers: new Map(),
};

/** Wire the transport at boot. Redis-less deployments use the local emitter. */
export function initSseBus(redisUrl?: string): void {
  if (!redisUrl) {
    // Redis-less mode (dev/test): reset any Redis transport, keep the emitter.
    bus.publisher = null;
    bus.subscriber = null;
    return;
  }
  if (bus.publisher && bus.subscriber) return; // already wired
  const opts = { maxRetriesPerRequest: null, enableReadyCheck: false };
  bus.publisher = new IORedis(redisUrl, opts);
  const subscriber = new IORedis(redisUrl, opts);
  subscriber.on("message", (channel: string, message: string) => deliver(channel, message));
  bus.subscriber = subscriber;
}

/** Best-effort publish: a fan-out failure must never fail the business flow. */
async function publish(channel: string, event: SseOutboundEvent): Promise<void> {
  const json = JSON.stringify(event);
  try {
    if (bus.publisher) {
      await bus.publisher.publish(channel, json);
    } else {
      bus.emitter.emit(channel, json);
    }
  } catch {
    // NFR-01 is a delivery guarantee for connected streams, never an excuse
    // to fail the committing transaction this event describes.
  }
}

/** Channel-bound fallback bridges so attach/detach add/remove them 1:1. */
const channelReceivers = new Map<string, (json: string) => void>();

function deliver(channel: string, json: string): void {
  let event: SseOutboundEvent;
  try {
    event = JSON.parse(json) as SseOutboundEvent;
  } catch {
    return; // malformed frame: drop it, the stream stays alive
  }
  const subscribers = bus.channelSubscribers.get(channel);
  if (!subscribers) return;
  for (const write of subscribers) {
    try {
      write(event);
    } catch {
      // A dead client write must not break the fan-out to the others.
    }
  }
}

function attach(channel: string, onEvent: (event: SseOutboundEvent) => void): () => void {
  let set = bus.channelSubscribers.get(channel);
  if (!set) {
    set = new Set();
    bus.channelSubscribers.set(channel, set);
    if (bus.subscriber) {
      void bus.subscriber.subscribe(channel).catch(() => undefined);
    } else {
      // Fallback transport: bridge the local emitter into the same deliver
      // path the Redis subscriber uses. Removed with the last subscriber.
      let bridge = channelReceivers.get(channel);
      if (!bridge) {
        bridge = (json: string) => deliver(channel, json);
        channelReceivers.set(channel, bridge);
      }
      bus.emitter.on(channel, bridge);
    }
  }
  set.add(onEvent);

  return () => {
    const current = bus.channelSubscribers.get(channel);
    current?.delete(onEvent);
    if (current && current.size === 0) {
      bus.channelSubscribers.delete(channel);
      if (bus.subscriber) {
        void bus.subscriber.unsubscribe(channel).catch(() => undefined);
      } else {
        const bridge = channelReceivers.get(channel);
        if (bridge) {
          bus.emitter.off(channel, bridge);
          channelReceivers.delete(channel);
        }
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/* Producer API (called after commit)                                  */
/* ------------------------------------------------------------------ */

/** Push an availability event pre-computed by the caller. */
export function pushAvailabilityEvent(event: AvailabilityEvent): Promise<void> {
  return publish(PUBLIC_CHANNEL, event);
}

/**
 * Compute `availableNow` for one offering and push the availability event.
 * Called AFTER commit so the count reflects all the changes of that commit.
 * Always resolves normally: a failed fan-out never fails the business flow
 * whose commit produced it (NFR-01 is about connected streams, not failures
 * of the flow itself).
 */
export async function publishAvailability(
  exec: QueryExecutor,
  outletId: string,
  category: string,
): Promise<void> {
  try {
    const count = await availableNow(exec, { outletId, category });
    await pushAvailabilityEvent({ type: "availability", outletId, category, availableNow: count });
  } catch {
    // swallowed by design (see above)
  }
}

/** Push one owner-scoped event (rental state or bike state). */
export function pushOwnerEvent(ownerId: string, event: OwnerEvent): Promise<void> {
  return publish(ownerChannel(ownerId), event);
}

/* ------------------------------------------------------------------ */
/* Consumer API (stream endpoints)                                     */
/* ------------------------------------------------------------------ */

export function subscribePublic(onEvent: (event: AvailabilityEvent) => void): () => void {
  return attach(PUBLIC_CHANNEL, onEvent as (event: SseOutboundEvent) => void);
}

export function subscribeOwner(ownerId: string, onEvent: (event: OwnerEvent) => void): () => void {
  return attach(ownerChannel(ownerId), onEvent as (event: SseOutboundEvent) => void);
}

/** Tear down transports (buildApp close + worker shutdown). */
export async function closeSseBus(): Promise<void> {
  const { publisher, subscriber } = bus;
  bus.publisher = null;
  bus.subscriber = null;
  await Promise.allSettled([publisher?.quit(), subscriber?.quit()]);
}
