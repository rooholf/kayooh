/**
 * Guest-token store (A-18).
 *
 * A guest booking returns a reservation-scoped signed `guestToken` once. The
 * renter has no session, so the token is the only key to that reservation — we
 * keep it client-side, keyed by reservation id, and replay it as
 * `Authorization: Bearer <guestToken>` on `GET /reservations/{id}`.
 *
 * localStorage only (SSR-safe guards); never sent anywhere but the API.
 */
const KEY = "kayooh.guest.tokens.v1";

type TokenMap = Record<string, string>;

function read(): TokenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: TokenMap = {};
    for (const [id, token] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof token === "string") out[id] = token;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveGuestToken(reservationId: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    const map = read();
    map[reservationId] = token;
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage full or blocked — the token simply isn't remembered */
  }
}

export function getGuestToken(reservationId: string): string | null {
  return read()[reservationId] ?? null;
}

/**
 * Reservation ids this device holds a guest token for, most recent last.
 * A guest has no list endpoint (A-18), so this is the only "check my
 * reservation" index the renter has — the ticket links the tokens unlock.
 */
export function listGuestReservationIds(): string[] {
  return Object.keys(read());
}
