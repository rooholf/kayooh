# Phase 1 — Step 5 (Staff PWA) & Step 7 (Admin Console) Execution Plan

**Author role:** Lead Platform Architect (per AGENTS.md #1)
**Source of truth:** `SRS_Jambi_Bike_Rental_Platform.md` v1.3 — §6.6 (FR-RNT-01..05), §6.7 (FR-REP-01/02), §6.8 (FR-NOT-01), §6.10 (FR-SEC-01/02), §7.2/§7.4, §12 steps 5–7.
**Scope:** Finalize the operational loop after renter guest checkout + basic owner dashboard summary. No code is written by this plan; it is a checklist for the Technical Project Manager to convert into GitHub issues.

Gates that must remain green throughout: `tsc --noEmit`, `eslint`, Vitest 114+ against `kayooh_test`, NFR-09 coverage on `modules/inventory`, `modules/ledger`, `modules/pricing`. Dev DB (`kayooh`) must never be truncated (issue #32).

---

## A. Staff PWA — `apps/staff` (Offline PWA Engineer)

### A.1 App shell & installability (NFR-07)
- [ ] A.1.1 Vite + React + TypeScript strict; Tailwind + shadcn/ui tokens consistent with `apps/web`.
- [ ] A.1.2 Workbox precache of the app shell in `vite.config.ts` (service worker) so a repeat visit loads and accepts scans offline.
- [ ] A.1.3 Manifest (`public/manifest.webmanifest`): name, icons, `display: standalone`, theme color; install prompt handled.
- [ ] A.1.4 Auth gate: staff email/password sign-in (Better Auth), session TTL 12 h absolute; outlet scope resolved from session (`users.outlet_id`).
- [ ] A.1.5 Offline indicator + sync status chip (queued count, backoff step, next retry) driven by `syncEngine.getSnapshot()`.

### A.2 Dexie offline queue (already scaffolded — `src/db/scan-events.ts`)
- [ ] A.2.1 Keep the existing Dexie schema `scanEvents` with `&clientEventId` unique; do not change without a migration.
- [ ] A.2.2 Queue capacity 500 (`QUEUE_CAPACITY`): block new scans with a visible warning when `queuedCount() >= 500`; never silently drop.
- [ ] A.2.3 Enqueue path: every staff action writes to IndexedDB first (`enqueueEvent`) with `clientEventId` (UUID v4) and `occurredAt` (device UTC) BEFORE any network call (FR-OFF-01.1).
- [ ] A.2.4 Sync engine (`src/sync/engine.ts`): backoff ladder 5 s / 15 s / 60 s / 300 s cap; oldest `occurredAt` first; batch max 50; idempotent replay via `clientEventId`.
- [ ] A.2.5 Flush queue before `POST /staff/health-sync` (FR-INV-05.1).
- [ ] A.2.6 Verdict handling: `applied` → mark settled; `flagged` → 409 `SCAN_FLAGGED` with reason surfaced to staff; `rejected` → 400/422 with reason; unanswered claimed events returned to queue.
- [ ] A.2.7 Health-sync drift: send `physicalCounts` when staff enters them; show drift alert if `drift_pct > sync.drift_max_pct`.

### A.3 Voucher verification (FR-SEC-01, offline pre-check)
- [ ] A.3.1 Bundle the EdDSA public key set (JWKS) in the staff app for offline pre-check; server re-verifies authoritatively.
- [ ] A.3.2 Verify signature + `exp + 120 s >= occurredAt >= iat - 120 s`; expired/invalid → `VOUCHER_EXPIRED` / `VOUCHER_INVALID`.
- [ ] A.3.3 Bike-tag HMAC-SHA256 pre-check with key id; server additionally requires `bike.current_outlet_id === staff outlet`.

### A.4 Scan views & flows
- [ ] A.4.1 **Check-out view** (`checkout`): scan voucher (camera/QR), pick `bikeAssetTags` (length = `reservation.quantity`, distinct), V-CHECKLIST, photo upload (1–8), `collateral` (ktp/sim/vehicle + masked reference), `balanceCollection` (amount must equal `final_idr - dp_idr`, method cash/qris). Block submit if `queuedCount() >= 500`.
- [ ] A.4.2 **Check-in view** (`checkin`): scan bike tag; show late-fee preview from `lateMinutes`; no renter/phone involvement (INV-3).
- [ ] A.4.3 **Inspection view** (`inspection`): rentalId, result pass/damage_found/maintenance_required, checklist, photos (≥1 when damage_found), `damageDescription` required for damage_found.
- [ ] A.4.4 **Bike status change view** (`bike_status_change`): asset tag, to (available/maintenance/unavailable), reason; illegal transitions flagged `ILLEGAL_TRANSITION`.
- [ ] A.4.5 **Incident view** (`incident`): mechanical_failure (requires open rental → refund DP), bike_missing/bike_damaged (runs FR-INV-04 reallocation).
- [ ] A.4.6 **Overdue list** (`GET /staff/outlet/overdue`): open rentals past `expected_end_at` with escalation stage; "Call renter" action (stage 2+).
- [ ] A.4.7 **Expected rentals** (`GET /staff/outlet/expected?date=`): reservations starting that day, phone masked.
- [ ] A.4.8 **Bike list** (`GET /staff/outlet/bikes`): filter by state/category, cursor pagination.

### A.5 Photo upload
- [ ] A.5.1 Presigned upload via `POST /staff/photos/upload-url` (kind checklist/damage, contentType, sizeBytes ≤ 5 MiB); HEAD check server-side (V-PHOTO-KEY).
- [ ] A.5.2 Client uploads directly to S3-compatible storage; store returned `key` in event payload.

### A.6 SSE client (FR-REP-02 consumer, optional for staff)
- [ ] A.6.1 Staff app may subscribe to `/outlets/stream` for live availability; not required for P1 staff flows but useful for the overdue/expected views refresh.

---

## B. Admin Console — `apps/web` `(admin)` route group (Web Frontend Developer)

The single existing page (`apps/web/src/app/(admin)/admin/page.tsx`) is a placeholder. Build a real console.

### B.1 Shell & auth
- [ ] B.1.1 `(admin)` layout with sidebar nav, admin session guard (role `admin`, 8 h absolute, non-sliding), redirect to sign-in otherwise.
- [ ] B.1.2 Admin sign-in page (email/password) reusing Better Auth; lockout after 5 failures in 15 min.

### B.2 Onboarding pages (FR-CAT-02, §7.4)
- [ ] B.2.1 **Owners**: list + create form (`name`, `bankCode`, `bankAccountNumber`, `bankAccountName`); edit `status` active/suspended. Link `ownerId` shown.
- [ ] B.2.2 **Outlets**: create form (`ownerId` selector, `code` V-OUTLET-CODE, `name`, `address`, `description`, `lat`, `lng`, `hours`, `categories` multi-select). Sister-outlet gate surfaces `MULTI_OUTLET_DISABLED`. Edit status/hours/name/description/address/lat/lng.
- [ ] B.2.3 **Bikes**: single create + bulk create (max 200, all-or-nothing) with CSV/JSON paste; `assetTag`, `category`, `homeOutletId`. Show `CATEGORY_NOT_OFFERED` / `DUPLICATE_RESOURCE`.
- [ ] B.2.4 **Users**: create staff/owner/admin (`email`, `password`, `role`, `outletId` required for staff, `ownerId` required for owner); public sign-up disabled for these roles (FR-ID-02).
- [ ] B.2.5 **Bike state override**: `PATCH /admin/bikes/{id}/state` with `to` + `reason` (allowed transitions only).

### B.3 Configuration & pricing
- [ ] B.3.1 **Config editor**: `PATCH /admin/config` `{key, value}` with type-checking against section 4; audit logged.
- [ ] B.3.2 **Pricing rules**: `POST /admin/pricing-rules` (outletId?, category, dayType, rateIdr, effectiveFrom).
- [ ] B.3.3 **Promotions** [P2]: create/edit with code/kind/value/maxDiscount/starts/ends/scope/maxUses.
- [ ] B.3.4 **Commission rules** [P2]: `POST /admin/commission-rules`.

### B.4 Operations & audit
- [ ] B.4.1 **Flagged scans queue**: `GET /admin/flagged-scans`, resolve `dismissed|corrected` with note.
- [ ] B.4.2 **Audit log viewer**: filter by entity/actor/from/to, paging.
- [ ] B.4.3 **Disputes** [P2]: queue + resolve with decision/note/adjustmentIdr.
- [ ] B.4.4 **Payouts** [P2]: export CSV, retry, mark-paid.
- [ ] B.4.5 **Settlements** [P2]: build statements for a weekKey.

---

## C. Missing Backend Contracts (Backend Specialist)

Contracts currently live inline in `apps/api/src/modules/admin/routes.ts` and `apps/api/src/modules/staff/routes.ts` and are NOT in `packages/contracts`. Move them (and add the missing ones) so OpenAPI 3.1 generation (NFR-11) and T-14 cover them.

### C.1 `packages/contracts` — new modules
- [ ] C.1.1 Create `packages/contracts/src/staff.ts` exporting Zod schemas:
  - `staffEventSchema` discriminated union by `type` (checkout/checkin/inspection/bike_status_change/incident) with common `clientEventId` (V-CLIENT-EVENT-ID), `occurredAt` (V-TS, not later than server time + 5 min).
  - `checkoutEventSchema`: voucherToken (string max 2048), bikeAssetTags (V-ASSET-TAG[] length = reservation.quantity — validated in handler against reservation), checklist (V-CHECKLIST), photoKeys (V-PHOTO-KEY[] min/max from config), collateral (V-COLLATERAL), balanceCollection {amountIdr V-IDR, method cash|qris}.
  - `checkinEventSchema`: bikeAssetTag.
  - `inspectionEventSchema`: rentalId V-UUID, result enum, checklist, photoKeys (0–8, ≥1 if damage_found), damageDescription? V-TEXT-L (required if damage_found).
  - `bikeStatusChangeEventSchema`: bikeAssetTag, to enum, reason V-TEXT-L.
  - `incidentEventSchema`: incidentType enum, bikeAssetTag, rentalId? V-UUID, notes V-TEXT-L, photoKeys?.
  - `staffEventBatchSchema`: { events: staffEventSchema[] } min 1 max 50.
  - `healthSyncSchema`: sentAt V-TS, physicalCounts? { [category]: int ≥ 0 }.
  - `uploadUrlSchema`: kind enum checklist/damage, contentType string, sizeBytes 1..5242880.
- [ ] C.1.2 Create `packages/contracts/src/admin.ts` exporting schemas moved from inline:
  - `createOwnerSchema`, `patchOwnerSchema` (status active/suspended).
  - `createOutletSchema`, `patchOutletSchema`.
  - `createBikeSchema`, `bulkBikesSchema` (items 1..200).
  - `bikeStateChangeSchema` (to enum, reason V-TEXT-L).
  - `createUserSchema` (email, password, role staff/owner/admin, outletId? required for staff, ownerId? required for owner).
  - `pricingRuleSchema`, `configPatchSchema`, `promotionSchema`, `commissionRuleSchema`.
  - `flaggedScanResolveSchema` (resolution dismissed|corrected, note V-TEXT-L).
  - `auditLogQuerySchema`, `disputeResolveSchema`, `payoutRetrySchema`.
- [ ] C.1.3 Create `packages/contracts/src/owner.ts` (dashboard summary, bikes/rentals list queries, category patch, settings patch, disputes).
- [ ] C.1.4 Create `packages/contracts/src/sse.ts` for stream event payload shapes (availability, rental, bike_state).
- [ ] C.1.5 Re-export all new modules from `packages/contracts/src/index.ts`.
- [ ] C.1.6 Add `vWeekKey`? Already `weekKeySchema` exists; export a Zod variant if needed for admin settlement endpoints.

### C.2 `apps/api` — route wiring & handlers
- [ ] C.2.1 Staff routes (`modules/staff/routes.ts`): replace inline Zod with `@repo/contracts` schemas; ensure `POST /staff/events` and `/batch` return per-item verdicts; `POST /staff/health-sync` returns `{driftPct?}`.
- [ ] C.2.2 Staff outlet reads: `GET /staff/outlet/bikes`, `/expected`, `/overdue` with query validation (limit/cursor, date).
- [ ] C.2.3 Photo upload URL endpoint with HEAD existence + size check (V-PHOTO-KEY).
- [ ] C.2.4 Admin routes: move inline schemas to contracts; add missing endpoints from §7.4 not yet wired: `PATCH /admin/owners/{id}`, `PATCH /admin/outlets/{id}`, `PATCH /admin/bikes/{id}/state` (already), `POST /admin/users`, `POST /admin/pricing-rules`, `PATCH /admin/config`, `GET/PATCH /admin/flagged-scans`, `GET /admin/audit-log`, and P2 settlement/dispute/payout/promotion/commission endpoints.
- [ ] C.2.5 Owner routes (`modules/owner/routes.ts`): add `GET /owner/dashboard/summary` (already in `summary.ts`? verify), `GET /owner/rentals`, `GET /owner/bikes`, `PATCH /owner/outlets/{outletId}/categories/{category}` (safetyBuffer), `PATCH /owner/settings` (promoOptOut), `GET /owner/stream` (SSE).
- [ ] C.2.6 Catalog: add `GET /outlets/by-code/{code}` (V-OUTLET-CODE) for direct entry (revision 1.3).
- [ ] C.2.7 SSE module (`modules/sse`): implement `/outlets/stream` (public, availability events within 2 s via Redis pub/sub, 25 s heartbeat) and `/owner/stream` (owner session, rental + bike_state filtered by owner_id; 401 without session). Emit events from reservation/bike/rental commits.
- [ ] C.2.8 Reallocation at-risk UI support: `GET /reservations/{id}/alternatives`, `POST /reservations/{id}/reallocate`, `POST /reservations/{id}/decline-reallocation` (already in service; verify routes + contracts).
- [ ] C.2.9 Voucher endpoint guest access: `GET /reservations/{id}/voucher` accepts `Authorization: Bearer <guestToken>` (A-18) in addition to session.
- [ ] C.2.10 Reservation list proxy: keep same-origin Next.js proxy for session auth; document that no CORS change is needed.

### C.3 `apps/api` — contracts in `packages/contracts` must be the only source
- [ ] C.3.1 Remove duplicate inline Zod from route files; import from `@repo/contracts`. Add a CI check (or test) that every route references a contract schema (NFR-11).
- [ ] C.3.2 OpenAPI 3.1 generation from contracts served at `/api/v1/docs` in non-prod.

### C.4 Data/seed
- [ ] C.4.1 Seed `booking.max_active_reservations_per_phone = 3` (A-19) into `app_config` so the per-phone guard is live.
- [ ] C.4.2 Seed staff/owner/admin users for the 4 outlets/owners so the admin console and staff PWA are testable (idempotent seed).
- [ ] C.4.3 Seed pricing rules + commission rule defaults per section 4.

---

## D. Tests & verification (QA & SDET)

- [ ] D.1 T-07 (replay idempotency, batch ordering) against real Postgres + FakeGateway.
- [ ] D.2 T-13 (Playwright end-to-end guest flow with quantity = 2, guestToken voucher, staff checkout/checkin/inspection) — unblocked by #21/#22.
- [ ] D.3 T-15 (reallocation accept/decline) and T-16 (flag reasons leave state unchanged).
- [ ] D.4 T-14 (Zod boundary values) extended to new staff/admin/owner schemas.
- [ ] D.5 Playwright staff PWA offline spec: queue 3 events offline, reconnect, verify applied; queue capacity warning at 500 (mocked).
- [ ] D.6 Playwright admin console spec: create owner → outlet → bikes (single + bulk) → staff user; verify linking via ownerId/outletId.
- [ ] D.7 Concurrency: staff events batch of 50 replayed out of order applies in `occurredAt` order.
- [ ] D.8 NFR-09 gates green: lint, tsc, integration tests against `kayooh_test`, coverage ≥ 90% on inventory/ledger/pricing.

---

## E. Order of execution (per SRS §12)

1. **C.1/C.2/C.3** contracts + route wiring (backend) — enables both frontends.
2. **A** Staff PWA (depends on C.1 staff schemas + C.2.1–C.2.3).
3. **B** Admin console (depends on C.1 admin schemas + C.2.4).
4. **D** Tests + E2E (depends on A + B).
5. Merge each as its own PR into `staging` after NFR-09 gates pass; close the corresponding GitHub issues.

## F. Issues to open (TPM)

- `feat(staff): offline-first PWA shell + Workbox precache` (A.1)
- `feat(staff): Dexie queue capacity guard + sync status UI` (A.2)
- `feat(staff): voucher offline pre-check (EdDSA + HMAC)` (A.3)
- `feat(staff): checkout/checkin/inspection/status/incident views` (A.4)
- `feat(staff): photo presigned upload` (A.5)
- `feat(web): admin console shell + auth` (B.1)
- `feat(web): admin onboarding pages (owners/outlets/bikes/users)` (B.2)
- `feat(web): admin config/pricing/promotions/commission editors` (B.3)
- `feat(web): admin flagged-scans/audit/disputes/payouts/settlements` (B.4)
- `feat(contracts): staff + admin + owner + sse Zod schemas` (C.1)
- `feat(api): staff/admin/owner route wiring + by-code + SSE streams` (C.2)
- `chore(seed): active-reservations-per-phone, staff/owner/admin users, pricing defaults` (C.4)
- `test: T-07/T-13/T-15/T-16 + staff/admin Playwright specs` (D)

## G. Invariants to re-verify (Lead Architect sign-off before merge)

- INV-1..INV-6 unchanged; NEG-1..NEG-8 unchanged.
- No GPS, no bike ids before check-out, no renter rental-end endpoint.
- Money as integer rupiah (`bigint`) only — lint rule holds.
- Renter coordinates redacted in pino and never persisted.
- RLS on owner endpoints via `app.owner_id` (FR-ID-03).
- Offline collateral (V-COLLATERAL) REQUIRED at check-out; balance must equal `final_idr - dp_idr`.
- Multi-bike `quantity` flows through checkout (one rental per bike tag, shared reservation + collateral).
- Guest checkout + 50% DP + optional auth (revision 1.2) untouched.
- Direct outlet entry by code (revision 1.3) used by renter surface; global outlet list deprioritized.
- Dev DB isolation (issue #32) preserved — tests run against `kayooh_test`.
