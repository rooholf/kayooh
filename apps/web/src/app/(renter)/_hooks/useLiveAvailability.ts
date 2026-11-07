"use client";

/**
 * useLiveAvailability — the renter client half of FR-REP-02.
 *
 * Subscribes anonymously to `GET {API}/api/v1/outlets/stream`
 * (public, `text/event-stream`) and patches the shared ["outlets"] TanStack
 * cache IN PLACE as `availability` events arrive — no refetch, so counts move
 * within the 2 s NFR-01 window without reloading the catalog. NEG-2 holds:
 * events carry counts, never bike ids; the client sends nothing (NEG-4).
 *
 * Reconnects with exponential backoff (1 s → 30 s cap) instead of the server's
 * flat `retry: 3000` hint, resetting on each successful open. The 25 s
 * heartbeat is a SSE comment (`: heartbeat`) that EventSource ignores
 * natively — it marks liveness without touching the event handlers. When
 * EventSource is unavailable (old browser, blocked connection) the hook is a
 * no-op and the existing manual "Muat ulang" behaviour stays the only path.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OutletListResponse } from "@repo/contracts";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

type AvailabilityEvent = {
  type: string;
  outletId: string;
  category: string;
  availableNow: number;
};

export function useLiveAvailability(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.EventSource !== "function") {
      return; // manual/refetch behaviour remains the fallback
    }

    const patchOne = (e: AvailabilityEvent) => {
      queryClient.setQueryData<OutletListResponse>(["outlets"], (prev) => {
        if (!prev) return prev; // catalog not loaded yet; the stream waits
        const index = prev.outlets.findIndex((o) => o.id === e.outletId);
        if (index < 0) return prev;
        const outlet = prev.outlets[index]!;
        const previous = outlet.availability[e.category];
        if (previous === e.availableNow) return prev; // no-op
        const outlets = prev.outlets.slice();
        outlets[index] = {
          ...outlet,
          availability: { ...outlet.availability, [e.category]: e.availableNow },
        };
        return { ...prev, outlets };
      });
    };

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource(`${API_BASE}/api/v1/outlets/stream`);
      source.addEventListener("availability", (event) => {
        try {
          patchOne(JSON.parse((event as MessageEvent).data) as AvailabilityEvent);
        } catch {
          // A malformed frame is dropped; the stream stays alive.
        }
      });
      source.addEventListener("open", () => {
        attempt = 0; // healthy connection — restart the backoff ladder
      });
      source.addEventListener("error", () => {
        // Close and re-open ourselves so the delay grows exponentially.
        source?.close();
        source = null;
        if (disposed) return;
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [queryClient]);
}
