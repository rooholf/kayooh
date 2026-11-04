/**
 * NotificationProvider interface (SRS 2) — all third-party messaging sits
 * strictly behind this seam. Real WhatsApp Business / SMTP adapters arrive
 * with FR-NOT-01; the shipping implementation for step 2 is the dev logger.
 * NEG-7: no push. Channels: whatsapp | email.
 */
import type { NotificationChannel, NotificationProvider, NotificationTemplateName, SendInput } from "./types.js";
export type { NotificationChannel, NotificationProvider, NotificationTemplateName, SendInput };

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
  // The WhatsApp/email provider wiring lands with FR-NOT-01 (step 6).
  if (opts.nodeEnv === "production") {
    throw new Error(
      "No production NotificationProvider is wired yet; configure it before enabling production (FR-NOT-01).",
    );
  }
  return new LogNotificationProvider(opts.devLogOtp);
}
