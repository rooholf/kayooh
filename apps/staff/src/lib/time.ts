const WIB = "Asia/Jakarta";

/** "HH:MM" in WIB — every time on the card is WIB, whatever the device zone. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: WIB,
  }).format(new Date(iso));
}

/** "05 Nov 2026" in WIB. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: WIB,
  }).format(date);
}

/** Today's WIB calendar day as `YYYY-MM-DD` (V-DATE — what the staff
 * `expected` read takes). */
export function todayWibDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: WIB }).format(new Date());
}

export interface Shift {
  name: string;
  start: string;
  end: string;
}

/** The outlet's three shifts; the app bar names the one on duty now. */
export function currentShift(date = new Date()): Shift {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: WIB,
    }).format(date),
  );
  if (hour >= 8 && hour < 16) return { name: "Shift pagi", start: "08:00", end: "16:00" };
  if (hour >= 16) return { name: "Shift sore", start: "16:00", end: "00:00" };
  return { name: "Shift malam", start: "00:00", end: "08:00" };
}

/** Today's date in WIB, as an ISO-8601 UTC instant for a given wall clock. */
export function todayAtWib(clock: string): string {
  const [rawHour, rawMinute] = clock.split(":");
  const hour = Number(rawHour ?? "0");
  const minute = Number(rawMinute ?? "0");
  const wib = new Date(Date.now() + 7 * 3_600_000);
  const utcMs = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate(),
    hour - 7,
    minute,
    0,
    0,
  );
  return new Date(utcMs).toISOString();
}
