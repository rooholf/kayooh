/**
 * Catalog module — NEG-6 boundary. All exports go through this index.
 * FR-CAT-01 (outlet discovery) lives here; FR-CAT-02 (admin onboarding)
 * arrives with the admin console step.
 */
export { listOutlets, getOutletByCode, getOutletById, haversineKm, serverNow } from "./outlets.js";
export { registerCatalogRoutes } from "./routes.js";
