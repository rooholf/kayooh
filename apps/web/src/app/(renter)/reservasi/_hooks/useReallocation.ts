"use client";

/**
 * FR-INV-04.5/6 renter actions for an at-risk reservation:
 *
 *   POST /reservations/{id}/reallocate            {outletId} (Idempotency-Key)
 *   POST /reservations/{id}/decline-reallocation
 *
 * Both routes are session-only and in IDEMPOTENCY_ROUTES, so they go through
 * the same-origin POST pipe in `app/api/reservations/[[...path]]/route.ts` —
 * the proxy forwards the session cookie and an untouched `Idempotency-Key`.
 *
 * Response note: the built API answers decline with
 * `{reservationId}` (the refund row is created server-side); the SRS prose
 * `{refundId}` is not returned, and nothing is invented for it.
 */
import { useMutation } from "@tanstack/react-query";
import type { CreateReservationResponse } from "@repo/contracts";
import { ApiError, networkError, readApiError } from "../_lib/api";

const PROXY_BASE = "/api/reservations";

/** Accept the offer: run the FR-INV-02 lock at the target outlet (200 → new confirmed reservation). */
export function useReallocate(id: string) {
  return useMutation<CreateReservationResponse, ApiError, { targetOutletId: string }>({
    mutationFn: async ({ targetOutletId }) => {
      let res: Response;
      try {
        res = await fetch(
          `${PROXY_BASE}/${encodeURIComponent(id)}/reallocate`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Idempotency-Key": crypto.randomUUID(), // one key per attempt (SRS 3.2)
            },
            body: JSON.stringify({ outletId: targetOutletId }),
          },
        );
      } catch {
        throw networkError();
      }
      if (!res.ok) throw await readApiError(res, "Gagal memindahkan reservasi");
      return (await res.json()) as CreateReservationResponse;
    },
  });
}

/** Decline the offer: reservation cancelled + full refund (`reallocation_declined`). */
export function useDeclineReallocation(id: string) {
  return useMutation<{ reservationId: string }, ApiError, void>({
    mutationFn: async () => {
      let res: Response;
      try {
        res = await fetch(
          `${PROXY_BASE}/${encodeURIComponent(id)}/decline-reallocation`,
          { method: "POST" },
        );
      } catch {
        throw networkError();
      }
      if (!res.ok) throw await readApiError(res, "Gagal membatalkan reservasi");
      return (await res.json()) as { reservationId: string };
    },
  });
}
