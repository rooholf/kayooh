"use client";

/**
 * GET /reservations/{id} — the claim ticket's status (A-18).
 *
 * Reads go through the same-origin proxy (`/api/reservations/{id}`): a signed-in
 * renter is authenticated by the session cookie the proxy forwards, and a guest
 * by the reservation-scoped `guestToken` sent as `Authorization: Bearer <…>`.
 * When neither is present the API answers 401 and the sheet says so honestly
 * instead of inventing a state.
 */
import { useQuery } from "@tanstack/react-query";
import type { ReservationResource } from "@repo/contracts";
import { ApiError, networkError, readApiError } from "../_lib/api";

export async function fetchReservation(
  id: string,
  guestToken: string | null,
): Promise<ReservationResource> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (guestToken !== null) headers.Authorization = `Bearer ${guestToken}`;

  let res: Response;
  try {
    res = await fetch(`/api/reservations/${encodeURIComponent(id)}`, {
      headers,
      cache: "no-store",
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw await readApiError(res, "Gagal memuat reservasi");
  return (await res.json()) as ReservationResource;
}

/**
 * `ready` gates the first fetch until the device store has been read on the
 * client, so a guest token is never missed by a premature request.
 */
export function useReservation(id: string, guestToken: string | null, ready: boolean) {
  return useQuery<ReservationResource, ApiError>({
    queryKey: ["reservation", id, guestToken ?? ""],
    enabled: ready && id.length > 0,
    queryFn: () => fetchReservation(id, guestToken),
    refetchInterval: 30_000, // status settles when the DP webhook lands
    staleTime: 5_000,
  });
}
