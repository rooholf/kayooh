/**
 * PaymentGateway interface (SRS 2) — the Xendit integration sits strictly
 * behind this seam (AGENTS Backend directives). The shipping implementation is
 * the dev/test fixture gateway; the real Xendit adapter arrives with FR-PAY-01.
 *
 * SRS FR-INV-02 (step after commit): gateway.createInvoice({externalId,
 * amount, durationSeconds}) with an 8 s timeout. Success stores gateway_ref +
 * payment_url; failure cancels the reservation (502 GATEWAY_UNAVAILABLE).
 *
 * SRS FR-PAY-02/03: the same seam carries the webhook verification
 * (verifyWebhook), the refund leg (refund) and the P2 payout leg
 * (createDisbursement). The webhook signature check is a constant-time token
 * comparison; in P1 the fixture uses the `x-callback-token` test header.
 */
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { zodToDetails, AppError } from "../../lib/errors.js";

export interface CreateInvoiceInput {
  /** payment_intents.id (SRS FR-INV-02: externalId = intent.id). */
  externalId: string;
  /** Integer rupiah (INV-5). */
  amount: number;
  /** Invoice validity = hold window (hold.checkout_minutes * 60). */
  durationSeconds: number;
}

export interface InvoiceData {
  gatewayRef: string;
  paymentUrl: string;
}

/* ------------------------------------------------------------------ */
/* FR-PAY-01: invoice status (poll fallback when a webhook is missed)   */
/* ------------------------------------------------------------------ */

export interface GetInvoiceInput {
  /** payment_intents.id (the external_id handed to createInvoice). */
  externalId: string;
}

export interface InvoiceStatus {
  gatewayRef: string;
  status: "pending" | "paid" | "expired" | "failed";
  /** Integer rupiah actually paid; null while unsettled. */
  paidAmount: number | null;
}

/* ------------------------------------------------------------------ */
/* FR-PAY-03: refunds                                                   */
/* ------------------------------------------------------------------ */

export interface RefundInput {
  /** Idempotency key `refund-<refundId>` (FR-PAY-03.2) — safe to retry. */
  idempotencyKey: string;
  /** The invoice being refunded (intent.gateway_ref). */
  gatewayRef: string;
  /** Integer rupiah (INV-5). */
  amount: number;
}

export interface RefundData {
  gatewayRef: string;
  status: "succeeded" | "failed";
}

/* ------------------------------------------------------------------ */
/* FR-LED-04 (P2): payouts                                              */
/* ------------------------------------------------------------------ */

export interface CreateDisbursementInput {
  idempotencyKey: string;
  /** Integer rupiah (INV-5). */
  amount: number;
  /** Payout reference (statement week key, FR-LED-04). */
  reference: string;
  bankCode: string;
  accountNumber: string;
  accountHolderName?: string;
}

export interface DisbursementData {
  gatewayRef: string;
  status: "pending" | "succeeded" | "failed";
}

/* ------------------------------------------------------------------ */
/* FR-PAY-02: webhook verification + normalization                      */
/* ------------------------------------------------------------------ */

/** Normalized gateway event parsed from the raw webhook payload. */
export interface WebhookEvent {
  /** `payment_webhook_events.provider`. */
  provider: string;
  /** Gateway-side unique id — the UNIQUE (provider, event_id) dedupe key. */
  eventId: string;
  type: "PAID" | "EXPIRED" | "FAILED";
  /** payment_intents.id (the external_id we handed out). */
  externalId: string;
  /** Integer rupiah reported by the gateway (checked against the intent). */
  paidAmount: number;
}

export interface VerifyWebhookInput {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface PaymentGateway {
  /** Gateway name; the `{gateway}` webhook path segment must match it. */
  readonly provider: string;
  createInvoice(input: CreateInvoiceInput): Promise<InvoiceData>;
  getInvoice(input: GetInvoiceInput): Promise<InvoiceStatus>;
  refund(input: RefundInput): Promise<RefundData>;
  createDisbursement(input: CreateDisbursementInput): Promise<DisbursementData>;
  /**
   * FR-PAY-02.1: verifies the callback token with a constant-time comparison
   * and returns the normalized event. Throws `WEBHOOK_SIGNATURE_INVALID` on a
   * mismatch or a missing token — nothing is stored in that case.
   */
  verifyWebhook(input: VerifyWebhookInput): Promise<WebhookEvent>;
}

/* ------------------------------------------------------------------ */
/* Fixture gateway (P1)                                                 */
/* ------------------------------------------------------------------ */

/** The P1 test header carrying the callback token (FR-PAY-02.1). */
export const FIXTURE_WEBHOOK_HEADER = "x-callback-token";
/** Dev/test default; overridden by PAYMENT_WEBHOOK_SECRET in real envs. */
export const FIXTURE_DEFAULT_WEBHOOK_SECRET = "dev-fake-webhook-secret";

/** The fake gateway's raw payload shape (payload + header in P1). */
const fixtureWebhookBodySchema = z
  .object({
    event_id: z.string().min(1),
    external_id: z.string().uuid(),
    status: z.enum(["PAID", "EXPIRED", "FAILED"]),
    paid_amount: z.number().int().nonnegative().optional(),
  })
  .passthrough();

/** Constant-time string comparison (SRS FR-PAY-02.1). */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Dev/test fixture: deterministic fake invoices, refunds and payouts. NEVER in
 * production — the factory throws instead of returning it, mirroring
 * LogNotificationProvider (lib/notifications.ts).
 */
export class FixturePaymentGateway implements PaymentGateway {
  readonly provider = "fake";

  constructor(private readonly webhookSecret: string = FIXTURE_DEFAULT_WEBHOOK_SECRET) {}

  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceData> {
    return {
      gatewayRef: `fixture-${input.externalId}`,
      paymentUrl: `https://pay.fixtures.jambi.test/invoice/${input.externalId}`,
    };
  }

  async getInvoice(input: GetInvoiceInput): Promise<InvoiceStatus> {
    return { gatewayRef: `fixture-${input.externalId}`, status: "pending", paidAmount: null };
  }

  async refund(input: RefundInput): Promise<RefundData> {
    return { gatewayRef: `fixture-refund-${input.idempotencyKey}`, status: "succeeded" };
  }

  async createDisbursement(input: CreateDisbursementInput): Promise<DisbursementData> {
    return { gatewayRef: `fixture-disb-${input.idempotencyKey}`, status: "succeeded" };
  }

  async verifyWebhook(input: VerifyWebhookInput): Promise<WebhookEvent> {
    const token = firstHeader(input.headers[FIXTURE_WEBHOOK_HEADER]);
    if (typeof token !== "string" || !constantTimeEquals(token, this.webhookSecret)) {
      throw new AppError("WEBHOOK_SIGNATURE_INVALID", "Webhook callback token mismatch.");
    }
    const parsed = fixtureWebhookBodySchema.safeParse(input.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Malformed webhook payload.", zodToDetails(parsed.error));
    }
    return {
      provider: this.provider,
      eventId: parsed.data.event_id,
      type: parsed.data.status,
      externalId: parsed.data.external_id,
      paidAmount: parsed.data.paid_amount ?? 0,
    };
  }
}

/** Rejects if the gateway does not answer within timeoutMs (SRS: 8 s). */
export function withGatewayTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`gateway did not answer within ${timeoutMs} ms`));
      }, timeoutMs);
    }),
  ]);
}

export interface CreatePaymentGatewayOptions {
  nodeEnv: string;
  /** Callback token compared by verifyWebhook (FR-PAY-02.1). */
  webhookSecret?: string;
}

export function createPaymentGateway(opts: CreatePaymentGatewayOptions): PaymentGateway {
  // The Xendit provider wiring lands with FR-PAY-01 (step 7 of the build order).
  if (opts.nodeEnv === "production") {
    throw new Error(
      "No production PaymentGateway is wired yet; configure it before enabling production (FR-PAY-01).",
    );
  }
  return new FixturePaymentGateway(opts.webhookSecret ?? FIXTURE_DEFAULT_WEBHOOK_SECRET);
}

export const GATEWAY_TIMEOUT_MS = 8_000; // SRS FR-INV-02 (post-commit leg)
