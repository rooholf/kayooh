import {
  staffBikeItemSchema,
  staffExpectedItemSchema,
  staffOverdueItemSchema,
  uploadUrlResponseSchema,
  type StaffBikeItem,
  type StaffExpectedItem,
  type StaffOverdueItem,
  type UploadUrlResponse,
} from "@repo/contracts";
import { cacheOutletRead, getCachedOutletRead } from "../db/outlet-reads";
import type { EventType, ServerVerdict } from "../db/scan-events";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";
const TIMEOUT_MS = 15_000;

/** The wire shape of one event (SRS FR-OFF-01). */
export interface WireEvent {
  clientEventId: string;
  occurredAt: string;
  type: EventType;
  payload: Record<string, unknown>;
}

/**
 * Optional staff session bearer (SRS FR-ID-02.4: every staff endpoint is
 * role-guarded). The PWA's login flow lands later; until then the token is
 * injected at build time via `VITE_STAFF_TOKEN`. Unset -> requests go
 * without an `authorization` header and the server answers 401, which the
 * read fetchers treat as a network failure and fall back to the cache.
 */
function staffHeaders(): Record<string, string> {
  const token = import.meta.env.VITE_STAFF_TOKEN;
  return token ? { authorization: `Bearer ${String(token)}` } : {};
}

/**
 * FR-OFF-01.4 — `POST /staff/events/batch`, max 50 events, 200 with a per-item
 * verdict. Throws on anything else so the engine backs off and retries.
 */
export async function postEventBatch(events: WireEvent[]): Promise<ServerVerdict[]> {
  const res = await fetch(`${API_BASE}/staff/events/batch`, {
    method: "POST",
    headers: { "content-type": "application/json", ...staffHeaders() },
    body: JSON.stringify({ events }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Batch gagal (HTTP ${res.status})`);
  const body = (await res.json()) as { results?: ServerVerdict[] };
  return body.results ?? [];
}

/* ------------------------------------------------------------------ */
/* Outlet reads (SRS 7.2 — plan A.4.6 / A.4.7 / A.4.8)                */
/* ------------------------------------------------------------------ */

export interface OutletReadResult<P> {
  payload: P | null;
  /** ISO instant the answered fetch happened (or the cache was written). */
  fetchedAt: string | null;
  /** True when the payload came from the local cache (offline fallback). */
  fromCache: boolean;
  /** Set when neither a fresh fetch nor a cache copy is available. */
  error: string | null;
}

async function readFresh<P>(
  path: string,
  parse: (body: unknown) => P,
): Promise<{ payload: P; body: string } | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: staffHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const body = JSON.parse(text) as unknown;
    return { payload: parse(body), body: text };
  } catch {
    return null;
  }
}

/**
 * Fetch a read, falling back to the last cached response when offline.
 * A fresh success overwrites the cache; a failure keeps the previous one.
 */
async function outletRead<P>(
  key: string,
  path: string,
  parse: (body: unknown) => P,
): Promise<OutletReadResult<P>> {
  const cached = await getCachedOutletRead(key);
  const fresh = await readFresh(path, parse);
  if (fresh) {
    await cacheOutletRead(key, fresh.body);
    return { payload: fresh.payload, fetchedAt: new Date().toISOString(), fromCache: false, error: null };
  }
  if (cached) {
    try {
      return {
        payload: parse(JSON.parse(cached.body) as unknown),
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        error: null,
      };
    } catch {
      // A cache row from an older build that no longer parses — drop it.
    }
  }
  return { payload: null, fetchedAt: null, fromCache: false, error: "Tak bisa memuat — periksa koneksi atau token" };
}

export interface OutletBikesQuery {
  state?: string;
  category?: string;
  limit?: number;
  cursor?: string;
}

/** One page of GET /staff/outlet/bikes (state/category filter + cursor). */
export interface OutletBikesPage {
  items: StaffBikeItem[];
  nextCursor: string | null;
}

export function fetchOutletBikes(
  query: OutletBikesQuery,
): Promise<OutletReadResult<OutletBikesPage>> {
  const params = new URLSearchParams();
  if (query.state) params.set("state", query.state);
  if (query.category) params.set("category", query.category);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const path = `/staff/outlet/bikes?${params.toString()}`;
  const key = `bikes:${query.state ?? "all"}:${query.category ?? "all"}`;

  return outletRead<OutletBikesPage>(key, path, (body) => {
    const page = body as { items?: unknown[]; nextCursor?: string | null };
    return {
      items: (page.items ?? []).map((item) => staffBikeItemSchema.parse(item)),
      nextCursor: page.nextCursor ?? null,
    };
  });
}

/** GET /staff/outlet/expected?date= — reservations starting that WIB day. */
export function fetchExpectedRentals(date: string): Promise<OutletReadResult<StaffExpectedItem[]>> {
  const path = `/staff/outlet/expected?date=${encodeURIComponent(date)}`;
  const key = `expected:${date}`;
  return outletRead<StaffExpectedItem[]>(key, path, (body) =>
    ((body as { items?: unknown[] }).items ?? []).map((item) => staffExpectedItemSchema.parse(item)),
  );
}

/** GET /staff/outlet/overdue — open rentals past expected_end_at. */
export function fetchOverdueRentals(): Promise<OutletReadResult<StaffOverdueItem[]>> {
  return outletRead<StaffOverdueItem[]>("overdue", "/staff/outlet/overdue", (body) =>
    ((body as { items?: unknown[] }).items ?? []).map((item) => staffOverdueItemSchema.parse(item)),
  );
}

/* ------------------------------------------------------------------ */
/* Health-sync (SRS 7.2 — plan A.2.7 / FR-INV-05)                     */
/* ------------------------------------------------------------------ */

/**
 * FR-INV-05 / A.2.7 — `POST /staff/health-sync`. `physicalCounts` is sent
 * when the staff member entered them; the server answers with `driftPct?`,
 * and the client raises a drift alert above `sync.drift_max_pct`.
 */
export interface HealthSyncResult {
  driftPct?: number;
}

export async function postHealthSync(
  sentAt: string,
  physicalCounts?: Record<string, number>,
): Promise<HealthSyncResult> {
  const res = await fetch(`${API_BASE}/staff/health-sync`, {
    method: "POST",
    headers: { "content-type": "application/json", ...staffHeaders() },
    body: JSON.stringify({
      sentAt,
      ...(physicalCounts ? { physicalCounts } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Health-sync gagal (HTTP ${res.status})`);
  const body = (await res.json()) as HealthSyncResult;
  return { driftPct: body.driftPct };
}

/* ------------------------------------------------------------------ */
/* Photo upload (SRS 7.2 — plan A.5, V-PHOTO-KEY)                      */
/* ------------------------------------------------------------------ */

/**
 * A.5.2 — presign one photo upload (`POST /staff/photos/upload-url`).
 * The response is schema-checked so a malformed `key` can never enter the
 * event payload (V-PHOTO-KEY is re-verified server-side at sync).
 */
export async function postPhotoUploadUrl(
  kind: "checklist" | "damage",
  contentType: string,
  sizeBytes: number,
): Promise<UploadUrlResponse> {
  const res = await fetch(`${API_BASE}/staff/photos/upload-url`, {
    method: "POST",
    headers: { "content-type": "application/json", ...staffHeaders() },
    body: JSON.stringify({ kind, contentType, sizeBytes }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Presign gagal (HTTP ${res.status})`);
  return uploadUrlResponseSchema.parse(await res.json());
}

/**
 * A.5.2 — upload the object bytes DIRECTLY to storage (the presigned-style
 * PUT; the API is not in the byte path). `application/octet-stream` is the
 * contract of the presigned URL regardless of the image's own type.
 */
export async function putPhotoObject(uploadUrl: string, file: Blob): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`Unggah foto gagal (HTTP ${res.status})`);
}
