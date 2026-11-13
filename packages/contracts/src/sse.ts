/**
 * SSE stream payload contracts (FR-REP-02).
 *
 *   `availability` — public `/outlets/stream` (anonymous); delivered within
 *     2 s of the committing change (NFR-01). Carries the renter's chosen
 *     `window` when the subscriber mirrored a 15-min slot (revision 1.2).
 *   `rental` / `bike_state` — owner-scoped `/owner/stream`, filtered
 *     server-side per owner channel.
 */
import { z } from "zod";
import { vAssetTag, vCategoryCode, vTs, vUuid } from "./validation.js";
import { bikeStateSchema } from "./admin.js";
import { rentalStatusSchema } from "./owner.js";

export const availabilityEventSchema = z
  .object({
    type: z.literal("availability"),
    outletId: vUuid,
    category: vCategoryCode,
    availableNow: z.number().int().min(0),
    /** Present on slot-mirrored frames (the subscriber's chosen window). */
    window: z.object({ startsAt: vTs, endsAt: vTs }).strict().optional(),
  })
  .strict();
export type AvailabilityEvent = z.infer<typeof availabilityEventSchema>;

export const rentalEventSchema = z
  .object({
    type: z.literal("rental"),
    outletId: vUuid,
    rentalId: vUuid,
    state: rentalStatusSchema,
  })
  .strict();
export type RentalStreamEvent = z.infer<typeof rentalEventSchema>;

export const bikeStateEventSchema = z
  .object({
    type: z.literal("bike_state"),
    outletId: vUuid,
    bikeAssetTag: vAssetTag,
    state: bikeStateSchema,
  })
  .strict();
export type BikeStateStreamEvent = z.infer<typeof bikeStateEventSchema>;

export const sseEventSchema = z.discriminatedUnion("type", [
  availabilityEventSchema,
  rentalEventSchema,
  bikeStateEventSchema,
]);
export type SseEvent = z.infer<typeof sseEventSchema>;

/**
 * Slot-mirroring query of the public availability stream (revision 1.2):
 * all four parameters together, 15-min-aligned windows validated by the
 * route (V-SLOT alignment + 7-day cap).
 */
export const outletStreamQuerySchema = z
  .object({
    outletId: vUuid,
    category: vCategoryCode,
    startsAt: vTs,
    endsAt: vTs,
  })
  .strict();
export type OutletStreamQuery = z.infer<typeof outletStreamQuerySchema>;
