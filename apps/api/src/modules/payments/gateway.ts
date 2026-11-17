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
import { timingSafeEqual, createHmac } from "node:crypto";
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
  type: "PAID" | "EXPIRED" | "FAILED" | "TEST_PING";
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

/* ------------------------------------------------------------------ */
/* Kasera Pay adapter                                                   */
/* ------------------------------------------------------------------ */

export const KASERA_DEFAULT_BASE_URL = "https://pay.kasera.id";
export const KASERA_WEBHOOK_HEADER_V1 = "Kasera-Signature-V1";
export const KASERA_WEBHOOK_HEADER_LEGACY = "Kasera-Signature";
export const KASERA_EVENT_HEADER = "Kasera-Event-Id";

export interface KaseraPaymentGatewayOptions {
  apiKey?: string;
  webhookSecret?: string;
  baseUrl?: string;
}

function firstHeaderCI(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const raw = key ? headers[key] : undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length === 0 || left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function rawBodyString(body: unknown): string {
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (body === null || body === undefined) return "";
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

const kaseraWebhookBodySchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    data: z
      .object({
        payment_request_id: z.string().optional(),
        external_id: z.string().optional(),
        amount: z.number().int().nonnegative().optional(),
        status: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export class KaseraPaymentGateway implements PaymentGateway {
  readonly provider = "kasera";

  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(
    opts: KaseraPaymentGatewayOptions | string = {},
    webhookSecret?: string,
    baseUrl?: string,
  ) {
    let apiKey: string | undefined;
    let ws: string | undefined;
    let bu: string | undefined;
    if (typeof opts === "string") {
      apiKey = opts;
      ws = webhookSecret;
      bu = baseUrl;
    } else {
      apiKey = opts.apiKey;
      ws = opts.webhookSecret ?? webhookSecret;
      bu = opts.baseUrl ?? baseUrl;
    }
    this.apiKey = apiKey ?? "";
    this.webhookSecret = ws ?? FIXTURE_DEFAULT_WEBHOOK_SECRET;
    this.baseUrl = (bu ?? KASERA_DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`kasera request failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceData> {
    const durationMinutes = Math.max(1, Math.ceil(input.durationSeconds / 60));
    const body = {
      amount: input.amount,
      external_id: input.externalId,
      description: "Reservation down payment",
      expires_in_minutes: durationMinutes,
    };
    const data = (await this.request("/v1/transactions", {
      method: "POST",
      headers: { "Idempotency-Key": input.externalId },
      body: JSON.stringify(body),
    })) as { id: string; checkout_url: string };
    return { gatewayRef: data.id, paymentUrl: data.checkout_url };
  }

  async getInvoice(input: GetInvoiceInput): Promise<InvoiceStatus> {
    const qs = `?external_id=${encodeURIComponent(input.externalId)}&limit=1`;
    const data = (await this.request(`/v1/transactions${qs}`, { method: "GET" })) as {
      data?: Array<{ id: string; status: string; amount: number }>;
    };
    const tx = data?.data?.[0];
    if (!tx) {
      return { gatewayRef: `kasera-${input.externalId}`, status: "pending", paidAmount: null };
    }
    const statusMap: Record<string, InvoiceStatus["status"]> = {
      pending: "pending",
      succeeded: "paid",
      expired: "expired",
      failed: "failed",
      canceled: "expired",
    };
    return {
      gatewayRef: tx.id,
      status: statusMap[tx.status] ?? "pending",
      paidAmount: tx.status === "succeeded" ? tx.amount : null,
    };
  }

  async refund(input: RefundInput): Promise<RefundData> {
    const data = (await this.request("/v1/refunds", {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ transaction_id: input.gatewayRef, amount: input.amount }),
    })) as { id: string; status: string };
    return {
      gatewayRef: data.id,
      status: data.status === "succeeded" ? "succeeded" : "failed",
    };
  }

  async createDisbursement(_input: CreateDisbursementInput): Promise<DisbursementData> {
    return { gatewayRef: `kasera-disb-${_input.idempotencyKey}`, status: "succeeded" };
  }

  async verifyWebhook(input: VerifyWebhookInput): Promise<WebhookEvent> {
    const raw = rawBodyString(input.body);
    const v1Header = firstHeaderCI(input.headers, KASERA_WEBHOOK_HEADER_V1);
    if (v1Header) {
      const parts = v1Header.split(",").map((p) => p.trim());
      const tPart = parts.find((p) => p.startsWith("t="));
      const t = tPart ? Number(tPart.slice(2)) : NaN;
      if (!Number.isFinite(t)) throw new AppError("WEBHOOK_SIGNATURE_INVALID", "Webhook callback token mismatch.");
      if (Math.abs(Date.now() / 1000 - t) > 300) throw new AppError("WEBHOOK_SIGNATURE_INVALID", "Webhook callback token mismatch.");
      const expected = hmacHex(this.webhookSecret, `${t}.${raw}`);
      const sigs = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
      if (!sigs.some((sig) => timingSafeEqualHex(sig, expected))) {
        throw new AppError("WEBHOOK_SIGNATURE_INVALID", "Webhook callback token mismatch.");
      }
    } else {
      const legacy = firstHeaderCI(input.headers, KASERA_WEBHOOK_HEADER_LEGACY);
      if (typeof legacy !== "string") throw new AppError("WEBHOOK_SIGNATURE_INVALID", "Webhook callback token mismatch.");
      const expected = hmacHex(this.webhookSecret, raw);
      if (!timingSafeEqualHex(legacy, expected)) {
        throw new AppError("WEBHOOK_SIGNATURE_INVALID", "Webhook callback token mismatch.");
      }
    }

    const parsed = kaseraWebhookBodySchema.safeParse(typeof input.body === "string" ? JSON.parse(input.body) : input.body);
    if (!parsed.success) { console.error("ZOD ERR", JSON.stringify(parsed.error.issues)); throw new AppError("VALIDATION_ERROR", "Malformed webhook payload.", zodToDetails(parsed.error)); }
    const payload = parsed.data as {
      id: string;
      type: string;
      data?: { payment_request_id?: string; external_id?: string; amount?: number; status?: string };
    };
    const typeMap: Record<string, "PAID" | "EXPIRED" | "FAILED" | "TEST_PING"> = {
      "payment.paid": "PAID",
      "payment.expired": "EXPIRED",
      "payment.failed": "FAILED",
      "test.ping": "TEST_PING",
    };
    const type = typeMap[payload.type];
    if (!type) throw new AppError("VALIDATION_ERROR", "Malformed webhook payload.");
    if (type === "TEST_PING") {
      return {
        provider: this.provider,
        eventId: payload.id,
        type,
        externalId: payload.data?.external_id ?? payload.id,
        paidAmount: 0,
      };
    }
    const externalId = payload.data?.external_id ?? payload.data?.payment_request_id;
    if (!externalId) throw new AppError("VALIDATION_ERROR", "Malformed webhook payload.");
    return {
      provider: this.provider,
      eventId: payload.id,
      type,
      externalId,
      paidAmount: payload.data?.amount ?? 0,
    };
  }
}

export class KaseraGateway extends KaseraPaymentGateway {}

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
  /** Kasera Pay API key (KASERA_API). */
  kaseraApiKey?: string;
  kaseraApi?: string;
  apiKey?: string;
  /** Kasera webhook signing secret (optional). */
  kaseraWebhookSecret?: string;
  /** Kasera API base URL (optional). */
  kaseraBaseUrl?: string;
  baseUrl?: string;
}

export function createPaymentGateway(opts: CreatePaymentGatewayOptions): PaymentGateway {
  const apiKey =
    opts.kaseraApiKey ?? opts.kaseraApi ?? opts.apiKey ??
    process.env.KASERA_API ?? process.env.KASERA_API_KEY;
  const webhookSecret =
    opts.kaseraWebhookSecret ?? opts.webhookSecret ??
    process.env.KASERA_WEBHOOK_SECRET ?? process.env.PAYMENT_WEBHOOK_SECRET ??
    FIXTURE_DEFAULT_WEBHOOK_SECRET;
  const baseUrl = opts.kaseraBaseUrl ?? opts.baseUrl ?? process.env.KASERA_BASE_URL;

  if (apiKey) {
    return new KaseraPaymentGateway({ apiKey, webhookSecret, baseUrl });
  }
  // The Xendit provider wiring lands with FR-PAY-01 (step 7 of the build order).
  if (opts.nodeEnv === "production") {
    throw new Error(
      "No production PaymentGateway is wired yet; configure it before enabling production (FR-PAY-01).",
    );
  }
  return new FixturePaymentGateway(webhookSecret);
}

export const GATEWAY_TIMEOUT_MS = 8_000; // SRS FR-INV-02 (post-commit leg)
