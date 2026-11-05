import { postEventBatch, type WireEvent } from "../api/client";
import {
  BATCH_LIMIT,
  claimBatch,
  queuedCount,
  releaseBatch,
  settleBatch,
  type ScanEvent,
} from "../db/scan-events";

/**
 * FR-OFF-01.1 — retry ladder: 5 s, 15 s, 60 s, 300 s, then stay at the cap.
 * The ladder resets the moment a send succeeds or the network returns.
 */
export const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000] as const;
export const BACKOFF_CAP_MS = 300_000;

export interface SyncSnapshot {
  online: boolean;
  running: boolean;
  /** Index into BACKOFF_MS for the next retry, or null when idle/ready. */
  backoffStep: number | null;
  /** Epoch ms of the scheduled retry, or null when none is pending. */
  nextRetryAt: number | null;
  /** True when the last send failed on the network. */
  offlinePending: boolean;
  lastError: string | null;
}

type Listener = () => void;

function toWire(event: ScanEvent): WireEvent {
  return {
    clientEventId: event.clientEventId,
    occurredAt: event.occurredAt,
    type: event.type,
    payload: event.payload as Record<string, unknown>,
  };
}

/**
 * Drains the IndexedDB queue to the server: oldest `occurredAt` first, one
 * batch at a time, with the FR-OFF-01 backoff ladder between failures.
 */
class SyncEngine {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backoffIndex = 0;
  private running = false;
  private started = false;

  private state: SyncSnapshot = {
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    running: false,
    backoffStep: null,
    nextRetryAt: null,
    offlinePending: false,
    lastError: null,
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SyncSnapshot => this.state;

  private emit(patch: Partial<SyncSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    document.addEventListener("visibilitychange", this.handleVisible);
    this.schedule(0);
  }

  /** Reset the ladder and send now — used after a scan and on reconnect. */
  kick(): void {
    this.backoffIndex = 0;
    this.schedule(0);
  }

  private handleOnline = (): void => {
    this.emit({ online: true, offlinePending: false });
    this.kick();
  };

  private handleOffline = (): void => {
    this.emit({ online: false });
  };

  private handleVisible = (): void => {
    if (document.visibilityState === "visible") this.kick();
  };

  private schedule(delay: number, step: number | null = null): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.emit({
      nextRetryAt: delay > 0 ? Date.now() + delay : null,
      backoffStep: delay > 0 ? step : null,
    });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, delay);
  }

  private nextBackoffDelay(): { delay: number; step: number } {
    const step = Math.min(this.backoffIndex, BACKOFF_MS.length - 1);
    const delay = BACKOFF_MS[step] ?? BACKOFF_CAP_MS;
    this.backoffIndex = Math.min(this.backoffIndex + 1, BACKOFF_MS.length - 1);
    return { delay, step };
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    if (!navigator.onLine) {
      this.emit({ online: false, nextRetryAt: null, backoffStep: null });
      return;
    }

    this.running = true;
    this.emit({ running: true });

    let claimed: string[] = [];
    try {
      const batch = await claimBatch(BATCH_LIMIT);
      claimed = batch.map((event) => event.clientEventId);

      if (batch.length === 0) {
        this.backoffIndex = 0;
        this.emit({
          running: false,
          lastError: null,
          nextRetryAt: null,
          backoffStep: null,
          offlinePending: false,
        });
        return;
      }

      const verdicts = await postEventBatch(batch.map(toWire));
      await settleBatch(claimed, verdicts);

      this.backoffIndex = 0;
      this.emit({ running: false, lastError: null, offlinePending: false });

      if ((await queuedCount()) > 0) {
        this.schedule(0);
      } else {
        this.emit({ nextRetryAt: null, backoffStep: null });
      }
    } catch (error) {
      await releaseBatch(claimed);
      const { delay, step } = this.nextBackoffDelay();
      this.emit({
        running: false,
        offlinePending: true,
        backoffStep: step,
        lastError: error instanceof Error ? error.message : String(error),
      });
      this.schedule(delay, step);
    } finally {
      this.running = false;
    }
  }
}

export const syncEngine = new SyncEngine();
