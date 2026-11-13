/**
 * NotificationProvider interface (SRS 2) — all third-party messaging sits
 * strictly behind this seam. Real WhatsApp Business / SMTP adapters arrive
 * with FR-NOT-01; the shipping implementation for step 2 is the dev logger.
 * NEG-7: no push. Channels: whatsapp | email.
 */
import type { NotificationChannel, NotificationProvider, NotificationTemplateName, SendInput } from "./types.js";
export type { NotificationChannel, NotificationProvider, NotificationTemplateName, SendInput };

/**
 * FR-NOT-01.3 channel routing: WhatsApp carries renter messages; email
 * carries owner and admin messages. Every enqueuer picks the channel from
 * this ONE table instead of hardcoding "whatsapp"/"email" per call site.
 */
export const DEFAULT_CHANNEL_BY_TEMPLATE: Record<NotificationTemplateName, NotificationChannel> = {
  // Renter messages (whatsapp):
  otp: "whatsapp",
  reservation_confirmed: "whatsapp",
  guest_reservation_access: "whatsapp",
  no_show: "whatsapp",
  refund_issued: "whatsapp",
  reallocation_offer: "whatsapp",
  late_reminder: "whatsapp",
  // Owner/admin messages (email):
  owner_late_flag: "email",
  drift_alert: "email",
  // P2 owner messages (email, FR-LED-*):
  statement_ready: "email",
  payout_paid: "email",
  payout_failed: "email",
  dispute_update: "email",
};

/**
 * Logs the send instead of transmitting. NEVER in production (env guard).
 * OTP `code` var values are logged only with DEV_LOG_OTP (dev convenience for
 * local manual testing); they are still never written by business modules.
 */
export class LogNotificationProvider implements NotificationProvider {
  constructor(private readonly devLogOtp: boolean) {}

  async send(input: SendInput): Promise<void> {
    const vars =
      input.template === "otp" && !this.devLogOtp
        ? { ...input.vars, code: "[redacted]" }
        : input.vars;
    // Plain console here: this class exists only outside production logging
    // paths and must not require the fastify instance.
    console.info(JSON.stringify({ event: "notification.log_provider", ...input, vars }));
  }
}

export function createNotificationProvider(opts: {
  nodeEnv: string;
  devLogOtp: boolean;
}): NotificationProvider {
  // Production-grade WhatsApp/email adapters land with FR-NOT-01. Until then,
  // run with the logging provider in production with OTP values ALWAYS redacted
  // (NFR-06): messages are recorded to logs instead of being transmitted, so
  // the platform can boot and serve bookings while the real adapters are wired.
  if (opts.nodeEnv === "production") {
    return new LogNotificationProvider(false);
  }
  return new LogNotificationProvider(opts.devLogOtp);
}
