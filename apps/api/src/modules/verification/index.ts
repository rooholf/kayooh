/**
 * Verification module — NEG-6 boundary.
 * FR-ID-04 (renter ID verification, ManualReviewProvider) lives here.
 */
export {
  ManualReviewProvider,
  createVerificationProvider,
  type VerificationProvider,
  type VerificationSubmission,
} from "./provider.js";
export { registerVerificationRoutes } from "./routes.js";