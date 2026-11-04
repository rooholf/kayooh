/**
 * PaymentGateway interface (SRS 2) — the Xendit integration sits strictly
 * behind this seam (AGENTS Backend directives). The shipping implementation is
 * the dev/test fixture gateway; the real Xendit adapter arrives with FR-PAY-01.
 *
 * SRS FR-INV-02 (step after commit): gateway.createInvoice({externalId,
 * amount, durationSeconds}) with an 8 s timeout. Success stores gateway_ref +
 * payment_url; failure cancels the reservation (502 GATEWAY_UNAVAILABLE).
 */
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

export interface PaymentGateway {
  createInvoice(input: CreateInvoiceInput): Promise<InvoiceData>;
}

/**
 * Dev/test fixture: a deterministic fake invoice. NEVER in production — the
 * factory throws instead of returning it, mirroring LogNotificationProvider
 * (lib/notifications.ts).
 */
export class FixturePaymentGateway implements PaymentGateway {
  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceData> {
    return {
      gatewayRef: `fixture-${input.externalId}`,
      paymentUrl: `https://pay.fixtures.jambi.test/invoice/${input.externalId}`,
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

export function createPaymentGateway(opts: { nodeEnv: string }): PaymentGateway {
  // The Xendit provider wiring lands with FR-PAY-01 (step 7 of the build order).
  if (opts.nodeEnv === "production") {
    throw new Error(
      "No production PaymentGateway is wired yet; configure it before enabling production (FR-PAY-01).",
    );
  }
  return new FixturePaymentGateway();
}

export const GATEWAY_TIMEOUT_MS = 8_000; // SRS FR-INV-02 (post-commit leg)
