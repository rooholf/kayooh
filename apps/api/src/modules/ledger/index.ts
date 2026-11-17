/**
 * Ledger module — NEG-6 boundary. All exports go through this index.
 */
export {
  roundHalfUp,
  floor,
  floorDiv,
  floorDivision,
} from "./money.js";

export {
  getCommissionRule,
  createCommissionRule,
  type CommissionRule,
  type CreateCommissionRuleInput,
} from "./rules.js";

export {
  weekKeyOf,
  postRentalCompletion,
  postRentalLedger,
  postLedgerForRental,
  handleRentalCompleted,
  consumeRentalCompleted,
  postRefundReversal,
  consumeRefundIssued,
  postDamageClaimCredit,
  postManualAdjustment,
} from "./posting.js";

export { ledgerEntries, commissionRules, ledgerType } from "@repo/db";
