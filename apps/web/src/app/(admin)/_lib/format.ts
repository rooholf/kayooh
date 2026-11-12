/**
 * Indonesian display formatting for the admin board (PRODUCT.md conventions:
 * IDR with dot thousands, WIB stamps, `dd/mm` dates). Storage stays UTC;
 * every wall-clock value on the board is Asia/Jakarta (WIB, UTC+7).
 */

const WIB = "Asia/Jakarta";

/** `Rp 1.240.000` — dot thousands, no decimals, ever (INV-5). */
export function fmtIdr(n: number | bigint): string {
  return `Rp ${BigInt(n).toLocaleString("id-ID")}`;
}

/** Plain integer with dot thousands (counts stay in the mono voice). */
export function fmtInt(n: number): string {
  return n.toLocaleString("id-ID");
}

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function wibParts(d: Date): { date: Date; weekday: number } {
  // Format in WIB via Intl, then read the pieces back.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: WIB,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.weekday ?? "Sun",
  );
  const date = new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "00" : parts.hour),
    Number(parts.minute),
  );
  return { date, weekday: weekdayIndex < 0 ? 0 : weekdayIndex };
}

/** `Minggu 02 Nov 2026` — the top bar's WIB date. */
export function fmtWibDate(d: Date): string {
  const { date, weekday } = wibParts(d);
  const dd = String(date.getDate()).padStart(2, "0");
  return `${DAYS[weekday]} ${dd} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `07:12 WIB` */
export function fmtWibTime(d: Date): string {
  const { date } = wibParts(d);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} WIB`;
}

/** `02/11 · 07:12 WIB` — audit and scan timestamps. */
export function fmtWibStamp(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const { date } = wibParts(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} · ${hh}:${mi} WIB`;
}

/** `JMB-001-COM-014` → `…COM-014` tail for dense audit rows. */
export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

/** Scan-event type → Indonesian label (unknown types pass through). */
export function scanTypeLabel(type: string): string {
  switch (type) {
    case "check_out":
      return "Check-out";
    case "check_in":
      return "Check-in";
    case "inspection":
      return "Inspeksi";
    default:
      return type;
  }
}

/** Bike category code → the board's 3-letter tag. */
export function catTag(code: string): string {
  switch (code) {
    case "commuter":
      return "COM";
    case "road":
      return "ROD";
    case "mtb":
      return "MTB";
    case "fixie":
      return "FIX";
    default:
      return code.slice(0, 3).toUpperCase();
  }
}
