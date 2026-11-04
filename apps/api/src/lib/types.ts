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
export type NotificationTemplateName =
  | "otp"
  | "reservation_confirmed"
  | "no_show"
  | "refund_issued"
  | "reallocation_offer"
  | "verification_result"
  | "late_reminder"
  | "owner_late_flag"
  | "drift_alert";

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
