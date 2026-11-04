/**
 * Payments module — NEG-6 boundary. All exports go through this index.
 */
export {
  createPaymentGateway,
  withGatewayTimeout,
  GATEWAY_TIMEOUT_MS,
  FixturePaymentGateway,
  type CreateInvoiceInput,
  type InvoiceData,
  type PaymentGateway,
} from "./gateway.js";
