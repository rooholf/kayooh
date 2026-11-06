/**
 * SSE module — NEG-6 boundary.
 * FR-REP-02 (Server-Sent Events: /outlets/stream, /owner/stream) over a
 * Redis pub/sub bridge with an in-process fallback when REDIS_URL is unset.
 */
export { registerSseRoutes } from "./streams.js";
export {
  closeSseBus,
  initSseBus,
  ownerChannel,
  publishAvailability,
  pushAvailabilityEvent,
  pushOwnerEvent,
  subscribeOwner,
  subscribePublic,
  type AvailabilityEvent,
  type OwnerEvent,
  type SseOutboundEvent,
} from "./bus.js";
