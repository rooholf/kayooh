/**
 * Security deposits module — NEG-6 boundary.
 * FR-ID-05 (deposit top-up, webhook credit, release) lives here.
 */
export { topUpDeposit, releaseDeposit, type TopUpResult, type ReleaseResult } from "./service.js";
export { registerDepositRoutes } from "./routes.js";