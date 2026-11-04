/**
 * Identity module — NEG-6 boundary. All exports go through this index.
 * FR-ID-01 (renter OTP), FR-ID-02 (staff/owner/admin sign-in + provisioning),
 * FR-ID-03 support (owner DB context helpers).
 */
export { createAuthBundle } from "./auth.js";
export type { AuthBundle, AuthDeps } from "./auth.js";
export {
  OTP_LIMITS,
  consumeOtp,
  hashOtp,
  issueOtp,
  purgeExpiredOtps,
  verifyOtp,
} from "./otp.js";
export {
  ROLE_TTL_SECONDS,
  requireRole,
  resolvePrincipal,
  type Principal,
} from "./guards.js";
export {
  createAdminUser,
  getRenterProfile,
  type CreateAdminUserInput,
  type RenterProfile,
} from "./service.js";
export { registerIdentityRoutes } from "./routes.js";
