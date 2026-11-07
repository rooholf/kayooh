"use client";

/**
 * Shared outlet catalog query for the reservation sheet.
 *
 * Reuses the ["outlets"] cache the poster and the list already hold — the
 * reservation never issues a second catalog call. Availability is counts only
 * (INV-1/NEG-2); no coordinates ride this response (NEG-4).
 */
import { useQuery } from "@tanstack/react-query";
import type { OutletListResponse } from "@repo/contracts";
import { API_BASE } from "../_lib/api";

async function fetchOutlets(): Promise<OutletListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/outlets`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Gagal memuat katalog (HTTP ${res.status}).`);
  }
  return (await res.json()) as OutletListResponse;
}

export function useOutlets() {
  return useQuery({ queryKey: ["outlets"], queryFn: fetchOutlets });
}
