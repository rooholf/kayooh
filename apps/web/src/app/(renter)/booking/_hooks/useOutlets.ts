"use client";

import { useQuery } from "@tanstack/react-query";
import type { OutletListResponse } from "@repo/contracts";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

async function fetchOutlets(): Promise<OutletListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/outlets`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Gagal memuat katalog (HTTP ${res.status}).`);
  }
  return (await res.json()) as OutletListResponse;
}

/** Shared outlet catalog query — reuses the ["outlets"] cache held by the poster. */
export function useOutlets() {
  return useQuery({ queryKey: ["outlets"], queryFn: fetchOutlets });
}
