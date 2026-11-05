import { liveQuery } from "dexie";
import { useEffect, useState, useSyncExternalStore } from "react";
import { syncEngine, type SyncSnapshot } from "../sync/engine";

/** A tiny live-query bridge, so Dexie writes re-render the card. */
export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: unknown[] = [],
  initial?: T,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(initial);
  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: (result) => setValue(result),
      error: (error) => console.error("[liveQuery]", error),
    });
    return () => subscription.unsubscribe();
  }, deps);
  return value;
}

export function useSyncSnapshot(): SyncSnapshot {
  return useSyncExternalStore(
    syncEngine.subscribe,
    syncEngine.getSnapshot,
    syncEngine.getSnapshot,
  );
}
