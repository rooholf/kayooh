"use client";

/**
 * useOutletAvailability — the single-outlet half of FR-REP-02 (revision 1.3).
 *
 * The link-in-bio landing serves one outlet only, so it listens to the same
 * anonymous stream (`GET {API}/api/v1/outlets/stream`) and folds matching
 * `availability` events into LOCAL state — no catalog cache, no refetch:
 * counts move within the 2 s NFR-01 window. NEG-2 (counts, never bike ids);
 * the client sends nothing (NEG-4).
 *
 * Same reconnect ladder as the old multi-outlet hook: 1 s → 30 s cap,
 * reset on each healthy open; no-op where EventSource is unavailable
 * (the server-rendered figures remain the fallback).
 */
import { useEffect, useState } from "react";
import type { OutletListItem } from "@repo/contracts";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

type AvailabilityEvent = {
  type: string;
  outletId: string;
  category: string;
  availableNow: number;
};

/** Returns the outlet (same object identity when nothing changed). */
export function useOutletAvailability(
  initial: OutletListItem,
): OutletListItem {
  const [outlet, setOutlet] = useState(initial);

  // A server navigation to another outlet re-seeds from the new snapshot.
  useEffect(() => {
    setOutlet(initial);
  }, [initial]);

  useEffect(() => {
    const outletId = initial.id;
    if (
      typeof window === "undefined" ||
      typeof window.EventSource !== "function"
    ) {
      return; // server figures + manual refresh stay the fallback
    }

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource(`${API_BASE}/api/v1/outlets/stream`);
      source.addEventListener("availability", (event) => {
        try {
          const e = JSON.parse((event as MessageEvent).data) as AvailabilityEvent;
          if (e.outletId !== outletId) return;
          setOutlet((prev) => {
            const previous = prev.availability[e.category];
            if (previous === e.availableNow) return prev; // no render for no-op
            return {
              ...prev,
              availability: { ...prev.availability, [e.category]: e.availableNow },
            };
          });
        } catch {
          // A malformed frame is dropped; the stream stays alive.
        }
      });
      source.addEventListener("open", () => {
        attempt = 0; // healthy connection — restart the backoff ladder
      });
      source.addEventListener("error", () => {
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
    // One connection per outlet id; the snapshot itself is handled above.
  }, [initial.id]);

  return outlet;
}
