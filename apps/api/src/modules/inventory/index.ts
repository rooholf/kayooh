/**
 * Inventory module — NEG-6 boundary. All exports go through this index.
 * FR-INV-01 (availability), FR-INV-02 (reservation hold = the lock).
 */
export { computeAvailability, availableNow, type AvailabilityInput, type QueryExecutor } from "./availability.js";
export { countInService, countCommittedReservations, countCommittedRentals } from "./availability.js";
export { createReservationHold } from "./reservation-hold.js";
export { isOpenAt, isSlotAligned, openingHoursSchema, wibMinuteOfDay } from "./opening-hours.js";
