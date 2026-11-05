import { seedSampleData } from "../db/seed";
import { syncEngine } from "../sync/engine";
import { currentShift, formatDate } from "./time";

/** The outlet the signed-in staff member is scoped to. Server-provided in prod. */
export const outletContext = {
  outlet: "Telanaipura",
  staff: "Rina",
  category: "Semua kategori",
  /** Shift-opening count. Comes from the physical count / server, never a literal. */
  openingBalance: 12,
  dateLabel: formatDate(new Date()),
  shift: currentShift(),
};

let booted: Promise<void> | null = null;

/** Seed the sample card once, then start draining the offline queue. */
export function boot(): Promise<void> {
  if (!booted) {
    booted = (async () => {
      await seedSampleData();
      syncEngine.start();
    })();
  }
  return booted;
}
