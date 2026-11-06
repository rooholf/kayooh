/**
 * Payments module — NEG-6 boundary. All exports go through this index.
 */
export {
  createPaymentGateway,
  withGatewayTimeout,
  GATEWAY_TIMEOUT_MS,
  FixturePaymentGateway,
  FIXTURE_WEBHOOK_HEADER,
  FIXTURE_DEFAULT_WEBHOOK_SECRET,
  type CreateInvoiceInput,
  type InvoiceData,
  type CreatePaymentGatewayOptions,
  type GetInvoiceInput,
  type InvoiceStatus,
  type RefundInput,
  type RefundData,
  type CreateDisbursementInput,
  type DisbursementData,
  type VerifyWebhookInput,
  type WebhookEvent,
  type PaymentGateway,
} from "./gateway.js";
export {
  recordRefund,
  settleRefund,
  issueRefund,
  type RefundReason,
  type RefundStatus,
  type IssueRefundInput,
  type RecordedRefund,
} from "./refunds.js";
