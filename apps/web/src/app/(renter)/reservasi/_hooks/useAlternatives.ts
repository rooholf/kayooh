"use client";

/**
 * GET /reservations/{id}/alternatives (FR-INV-04.4) — the alternative outlets
 * offered to a renter whose reservation is flagged at-risk.
 *
 * The route is session-only (SRS §7.1 `renter` role), so this reads through the
 * same-origin proxy (`/api/reservations/{id}/alternatives`): the forwarded
 * cookie is the credential. A guest gets an honest 401, not dead controls.
 *
 * Shape note: the SRS endpoint table prose says `{outletId, name,
 * distanceKm?}`; the built API returns `{outletId, outletName, availableNow}`
 * — the UI follows the built API (no invented distance figures).
 */
import { useQuery } from "@tanstack/react-query";
import { ApiError, networkError, readApiError } from "../_lib/api";

/** One reallocation option — counts only (NEG-2), no coordinates (NEG-4). */
export interface Alternative {
  outletId: string;
  outletName: string;
  availableNow: number;
}

export interface AlternativesResponse {
  reservationId: string;
  alternatives: Alternative[];
}

async function fetchAlternatives(id: string): Promise<AlternativesResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/reservations/${encodeURIComponent(id)}/alternatives`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw await readApiError(res, "Gagal memuat pilihan outlet");
  return (await res.json()) as AlternativesResponse;
}

export function useAlternatives(id: string, enabled: boolean) {
  return useQuery<AlternativesResponse, ApiError>({
    queryKey: ["alternatives", id],
    enabled: enabled && id.length > 0,
    queryFn: () => fetchAlternatives(id),
    staleTime: 5_000,
  });
}
