"use client";

/**
 * GET /reservations/{id}/voucher — the QR token (FR-SEC-01.1).
 *
 * The voucher exists only while the reservation is `confirmed`; otherwise the
 * API answers 409 `STATE_CONFLICT`. The renter app must refetch every `ttl/2`
 * seconds, so the client polls at {@link VOUCHER_REFETCH_MS} while the ticket
 * is on screen. A guest authenticates with the same reservation-scoped token as
 * the detail read.
 */
import { useQuery } from "@tanstack/react-query";
import type { VoucherResponse } from "@repo/contracts";
import { ApiError, networkError, readApiError } from "../_lib/api";
import { VOUCHER_REFETCH_MS } from "../_lib/config";

async function fetchVoucher(id: string, guestToken: string | null): Promise<VoucherResponse> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (guestToken !== null) headers.Authorization = `Bearer ${guestToken}`;

  let res: Response;
  try {
    res = await fetch(`/api/reservations/${encodeURIComponent(id)}/voucher`, {
      headers,
      cache: "no-store",
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw await readApiError(res, "Gagal memuat tiket QR");
  return (await res.json()) as VoucherResponse;
}

export function useVoucher(id: string, guestToken: string | null, enabled: boolean) {
  return useQuery<VoucherResponse, ApiError>({
    queryKey: ["voucher", id, guestToken ?? ""],
    enabled: enabled && id.length > 0,
    queryFn: () => fetchVoucher(id, guestToken),
    refetchInterval: VOUCHER_REFETCH_MS,
    staleTime: 0,
    gcTime: 0,
  });
}
