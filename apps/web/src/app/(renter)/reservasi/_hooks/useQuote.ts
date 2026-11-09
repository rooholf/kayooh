"use client";

/**
 * POST /pricing/quote — the public price preview (FR-PRC-01).
 *
 * The quote scales price/DP/balance by `quantity` (FR-PRC-01, FR-INV-02);
 * the sheet sends the chosen quantity and prints the returned totals verbatim.
 * Nothing is persisted. Any promo requires a session (401 UNAUTHENTICATED) —
 * we never send one here.
 */
import { useQuery } from "@tanstack/react-query";
import type { QuoteResponse } from "@repo/contracts";
import { API_BASE, ApiError, networkError, readApiError } from "../_lib/api";

export interface QuoteInput {
  outletId: string;
  category: string;
  startsAt: string;
  endsAt: string;
  quantity: number;
}

async function fetchQuote(input: QuoteInput): Promise<QuoteResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/pricing/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        outletId: input.outletId,
        category: input.category,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        quantity: input.quantity,
      }),
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw await readApiError(res, "Gagal menghitung harga");
  return (await res.json()) as QuoteResponse;
}

/** Live quote for a chosen window; disabled until the window is complete. */
export function useQuote(input: QuoteInput | null) {
  return useQuery<QuoteResponse, ApiError>({
    queryKey: [
      "quote",
      input?.outletId ?? "",
      input?.category ?? "",
      input?.startsAt ?? "",
      input?.endsAt ?? "",
      input?.quantity ?? 1,
    ],
    enabled: input !== null,
    queryFn: () => fetchQuote(input as QuoteInput),
    staleTime: 15_000,
  });
}
