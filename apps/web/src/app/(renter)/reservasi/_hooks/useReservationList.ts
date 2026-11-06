"use client";

/**
 * GET /reservations — the signed-in renter's own reservations (SRS 3.2 list).
 *
 * Session-only (A-18): the request carries no token; the same-origin proxy
 * forwards the Better Auth cookie that authenticates the renter. A guest has no
 * list — they reach individual tickets through the device store instead.
 *
 * Cursor pagination: the API returns `{data, nextCursor}` in `created_at DESC`
 * order, so `useInfiniteQuery` pages with the opaque cursor verbatim (never
 * decoded or re-encoded on the client).
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ReservationListResponse } from "@repo/contracts";
import { ApiError, networkError, readApiError } from "../_lib/api";
import { LIST_PAGE_SIZE } from "../_lib/config";

async function fetchReservationList(cursor: string | null): Promise<ReservationListResponse> {
  const qs = new URLSearchParams({ limit: String(LIST_PAGE_SIZE) });
  if (cursor !== null) qs.set("cursor", cursor);

  let res: Response;
  try {
    res = await fetch(`/api/reservations?${qs.toString()}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw await readApiError(res, "Gagal memuat daftar reservasi");
  return (await res.json()) as ReservationListResponse;
}

export function useReservationList() {
  return useInfiniteQuery<ReservationListResponse, ApiError>({
    queryKey: ["reservations", "list"],
    queryFn: ({ pageParam }) => fetchReservationList(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: false,
    staleTime: 10_000,
  });
}
