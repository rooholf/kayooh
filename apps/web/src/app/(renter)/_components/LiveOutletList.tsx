"use client";

/**
 * LiveOutletList — the poster's "Ketersediaan Langsung" list as a client isle.
 *
 * The home poster itself renders on the server; this small client island owns
 * the shared ["outlets"] cache for it: the server-rendered response primes the
 * cache (`initial`), TanStack revalidates, and the FR-REP-02 SSE stream patches
 * counts IN PLACE as the server commits — no reload, categories and rows stay.
 * Server counts only (INV-1/NEG-2); no coordinates leave the client (NEG-4).
 */
import { useQuery } from "@tanstack/react-query";
import type { OutletListResponse } from "@repo/contracts";
import { useLiveAvailability } from "../_hooks/useLiveAvailability";
import { OutletList } from "./OutletList";

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

export function LiveOutletList({ initial }: { initial: OutletListResponse }) {
  const { data } = useQuery({
    queryKey: ["outlets"],
    queryFn: fetchOutlets,
    initialData: initial,
    // Home mounts fresh per navigation ('no-store' server fetch above);
    // the stale time matches the provider default for coherence.
    staleTime: 30_000,
  });

  useLiveAvailability();

  if (data.outlets.length === 0) {
    return <p className="notice">Belum ada outlet terdaftar.</p>;
  }
  return <OutletList outlets={data.outlets} />;
}
