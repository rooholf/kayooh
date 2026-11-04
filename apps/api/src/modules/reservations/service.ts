/**
 * Reservation module service seam — now implemented: the FR-INV-02 hold
 * transaction lives in modules/inventory (SKILL build_transactional_inventory_lock
 * executes there); this delegation keeps the route/module contract stable for
 * SKILL implement_zod_contract_route's handler wiring.
 */
import type { Database } from "@repo/db";
import type { CreateReservationBody, CreateReservationResponse } from "@repo/contracts";
import { createReservationHold } from "../inventory/index.js";
import type { Principal } from "../identity/guards.js";

export async function hold(
  db: Database,
  body: CreateReservationBody,
  renter: Principal,
): Promise<CreateReservationResponse> {
  return createReservationHold(db, body, renter);
}
