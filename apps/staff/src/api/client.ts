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
 * FR-OFF-01.4 — `POST /staff/events/batch`, max 50 events, 200 with a per-item
 * verdict. Throws on anything else so the engine backs off and retries.
 */
export async function postEventBatch(events: WireEvent[]): Promise<ServerVerdict[]> {
  const res = await fetch(`${API_BASE}/staff/events/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Batch gagal (HTTP ${res.status})`);
  const body = (await res.json()) as { results?: ServerVerdict[] };
  return body.results ?? [];
}

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
    headers: { "content-type": "application/json" },
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
