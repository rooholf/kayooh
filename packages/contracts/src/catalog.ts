/**
 * Catalog contracts (SRS 6.2, FR-CAT-01).
 *
 * NEG-2: renter-facing discovery returns COUNTS per category only — never
 * bike ids or asset tags. NEG-4: request lat/lng are used for sorting only
 * and are never persisted or logged.
 */
import { z } from "zod";
import { vCategoryCode } from "./validation.js";

/**
 * FR-CAT-01.1: lat/lng are both-or-neither (400 otherwise). They exist only
 * as query parameters for distance sorting (NEG-4). Query strings arrive as
 * text, so the numeric V-LAT/V-LNG bounds are applied after coercion.
 */
const queryLat = z.coerce.number().min(-90).max(90);
const queryLng = z.coerce.number().min(-180).max(180);

export const getOutletsQuerySchema = z
  .object({
    lat: queryLat.optional(),
    lng: queryLng.optional(),
    category: vCategoryCode.optional(),
  })
  .strict()
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), {
    message: "lat and lng must be provided together",
  });

export type GetOutletsQuery = z.infer<typeof getOutletsQuerySchema>;

/** Availability per category code, e.g. {"commuter": 3}. Zero-bike categories are omitted. */
export const outletAvailabilitySchema = z.record(z.string(), z.number().int().min(0));

export const outletListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  hours: z.unknown(),
  isOpenNow: z.boolean(),
  distanceKm: z.number().optional(),
  availability: outletAvailabilitySchema,
  // Deliberately absent: bikes[], bikeIds, assetTags (NEG-2).
});

export const outletListResponseSchema = z.object({
  outlets: z.array(outletListItemSchema),
});

export type OutletListItem = z.infer<typeof outletListItemSchema>;
export type OutletListResponse = z.infer<typeof outletListResponseSchema>;
