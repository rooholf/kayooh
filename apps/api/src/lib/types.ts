/**
 * Shared lib types to avoid circular imports between lib/ and modules/.
 */
import type { Redis } from "ioredis";

export interface HitOptions {
  limit: number;
  windowSec: number;
}

export interface HitResult {
  allowed: boolean;
  retryAfterSec: number;
  count: number;
}

export interface RateLimiter {
  hit(key: string, opts: HitOptions): Promise<HitResult>;
  /** Current count WITHOUT incrementing (for lockout checks). */
  peek(key: string): Promise<number>;
}

export type NotificationChannel = "whatsapp" | "email";

/**
 * Template catalog per SRS v1.2 FR-NOT-01.1: P1 set + the four P2
 * statement/payout/dispute templates (Phase 2). NOTE: the former
 * `verification_result` template was REMOVED with FR-ID-04 in revision 1.2.
 * `guest_reservation_access` carries the A-18 reservation-scoped guestToken to
 * a guest booking's contact phone.
 */
export type NotificationTemplateName =
  | "otp"
  | "reservation_confirmed"
  | "guest_reservation_access"
  | "no_show"
  | "refund_issued"
  | "reallocation_offer"
  | "late_reminder"
  | "owner_late_flag"
  | "drift_alert"
  // P2 (FR-LED-* , Phase 2):
  | "statement_ready"
  | "payout_paid"
  | "payout_failed"
  | "dispute_update";

export interface SendInput {
  channel: NotificationChannel;
  template: NotificationTemplateName;
  to: string;
  vars: Record<string, string | number | boolean>;
}

export interface NotificationProvider {
  send(input: SendInput): Promise<void>;
}

export type { Redis };
