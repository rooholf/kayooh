import { useEffect, useRef, useState } from "react";
import type { OutletReadResult } from "../api/client";

/**
 * Render state for an outlet read: the cache copy shows immediately, then a
 * fresh fetch (when the network answers) replaces it. `stale` marks the
 * cache copy until a fresh fetch lands, so the UI can show "tersimpan" —
 * FR-OFF-first: the lists always render, timestamped.
 */
export interface OutletReadState<P> {
  payload: P | null;
  fetchedAt: string | null;
  stale: boolean;
  error: string | null;
  loading: boolean;
}

export function useOutletRead<P>(
  key: string,
  fetcher: () => Promise<OutletReadResult<P>>,
  deps: unknown[],
): OutletReadState<P> {
  const [state, setState] = useState<OutletReadState<P>>({
    payload: null,
    fetchedAt: null,
    stale: false,
    error: null,
    loading: true,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    void fetcherRef.current().then((result) => {
      if (!alive) return;
      setState({
        payload: result.payload,
        fetchedAt: result.fetchedAt,
        stale: result.fromCache,
        error: result.error,
        loading: false,
      });
    });
    return () => {
      alive = false;
    };
  }, [key, ...deps]);

  return state;
}
