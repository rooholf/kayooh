/**
 * Owner module — NEG-6 boundary. FR-REP-01 (P1) dashboard + supporting
 * owner endpoints, all tenant-scoped through the FR-ID-03 RLS context.
 */
export { registerOwnerRoutes } from "./routes.js";
export { withOwnerContext } from "./context.js";