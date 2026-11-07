/**
 * Payment hand-off store.
 *
 * `POST /reservations` answers the gateway `paymentUrl` exactly once, in the
 * 201 — `GET /reservations/{id}` does not carry it. So a renter who lands back
 * on the ticket while the hold is still `held` can only "Lanjutkan pembayaran"
 * if this device remembered the URL. sessionStorage only (SSR-safe guards);
 * it dies with the tab, well before the 15-minute hold it belongs to.
 */
const KEY = "kayooh.payment.handoff.v1";

type UrlMap = Record<string, string>;

function read(): UrlMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: UrlMap = {};
    for (const [id, url] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof url === "string") out[id] = url;
    }
    return out;
  } catch {
    return {};
  }
}

export function savePaymentUrl(reservationId: string, url: string): void {
  if (typeof window === "undefined") return;
  try {
    const map = read();
    map[reservationId] = url;
    window.sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage blocked — the ticket simply won't offer a resume link */
  }
}

export function getPaymentUrl(reservationId: string): string | null {
  return read()[reservationId] ?? null;
}
