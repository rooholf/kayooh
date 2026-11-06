# Software Requirements Specification: Jambi Bike Rental Platform

Version 1.2 | 6 November 2026
Sources: PRD "Jambi Bike Rental Network: PRD and System Architecture" v1.2; "Tech Stack and Architecture: Jambi Bike Rental Platform" v1.0
Audience: AI coding agent. Implement from this document without asking for clarification. Every MUST is testable.

**Revision 1.2 — guest checkout and optional renter auth (conversion optimization).** This revision supersedes any earlier statement in conflict with it:
1. **Mandatory digital ID verification removed.** FR-ID-04, the renter ID screens and endpoints, the `verification_requests` and `id_document_views` tables and the `verification_status` enum are deleted; `POST /reservations` no longer returns 422 `VERIFICATION_REQUIRED`.
2. **Guest checkout.** Sign-in is optional (FR-ID-01). A renter may book from a public, unauthenticated session by supplying a contact phone (`contactPhone`, V-PHONE); the 50% online down payment (FR-INV-02) is the primary anti-spam and no-show control. A guest `renters` row is created keyed by phone with `user_id = NULL`.
3. **Incentivized auth.** Renter accounts now exist mainly to claim platform and owner promotions and vouchers; a `promoCode` is accepted only for an authenticated session (FR-PRC-01).
4. **Offline collateral retained.** Staff still collect and log physical collateral (KTP, SIM or vehicle) at check-out (FR-RNT-01); nothing about that flow changes.

**Revision 1.1 — architecture pivot to local Jambi operational practice.** This revision supersedes any earlier statement in conflict with it, except where revision 1.2 supersedes it:
1. **Multi-bike reservations.** `reservations.quantity` (V-QTY) is stored and checked against `computeAvailability`: a lock succeeds only when `available >= quantity`, otherwise 409 `SOLD_OUT`.
2. **Digital security deposits removed.** The `deposits` and `deposit_claims` tables, the `deposit_status` enum, and every deposit endpoint no longer exist.
3. **50% down payment (DP).** A reservation moves `held` → `confirmed` only after the DP (config `booking.dp_rate_bps`, default 5000 = 50%) is paid online. The remaining 50% is collected **offline** (cash/QRIS) by staff at check-out.
4. **Physical collateral.** The FR-RNT-01 check-out event carries `bikeAssetTags` (length = `reservation.quantity`) and a `collateral` object (`ktp`, `sim` or `vehicle`), logged on each rental.
5. **Configurable seed pricing.** Weekday/weekend tiers and local penalties (e.g. Rp 20,000 per started 30 min; Rp 4,000,000 lost unit) are **seed/mock data only** — owners may override their own pricing (section 4).
6. **Mock payments in P1.** Phase 1 uses the `FakeGateway` exclusively (section 2).

---

## 0. How to Read This Document

- **Keywords:** MUST, MUST NOT, SHOULD follow RFC 2119. Only MUST and MUST NOT create obligations.
- **IDs:** `INV-n` invariant, `NEG-n` prohibited behavior, `CFG-n` configuration parameter, `FR-<module>-nn` functional requirement, `NFR-nn` non-functional requirement, `T-nn` test, `A-nn` assumption.
- **Phase tags:** [P1] launch, [P2] money and reporting, [P3] growth. Build P1 first (section 12).
- **TBD values:** a business decision not yet made. Implement it as a config parameter from section 4. Use the listed FIXTURE value only in seed data and tests. Never hard-code it in business logic.
- **Source precedence:** the PRD wins on business rules; the tech document wins on implementation. Conflicts and gaps are logged in section 11. Where this SRS resolves a gap, it is tagged `A-nn`.
- **Strictness:** every request body, query and header is validated with Zod `.strict()` schemas from `packages/contracts`. Unknown fields return 400 `VALIDATION_ERROR`.

---

## 1. System Overview

### 1.1 Purpose and scope

A station-based, multi-owner bike rental aggregator for Jambi. Renters browse outlets, reserve a bike category for a time window, pay, collect the bike from a staffed outlet via QR scan, and return it to a staffed outlet of the same owner. Owners receive fleet visibility and weekly financial statements. The platform admin onboards owners, sets pricing and promotions, runs settlements and resolves disputes.

Network baseline (seed data): 4 outlets, 4 owners, 150 bikes.

| Outlet code | Name | Owner | Commuter | Road | MTB | Fixie | Total |
|---|---|---|---|---|---|---|---|
| JMB-001 | Telanaipura Hub | CV Jambi Sepeda Maju | 20 | 10 | 10 | 5 | 45 |
| JMB-002 | Danau Sipin Recreation | Sipin Lakeside Rentals | 15 | 0 | 10 | 5 | 30 |
| JMB-003 | Kotabaru | Kotabaru Active | 10 | 20 | 5 | 15 | 50 |
| JMB-004 | Pasar Jambi | Laju Express Rentals | 20 | 0 | 5 | 0 | 25 |

### 1.2 Roles

| Role | Scope | Created by |
|---|---|---|
| `renter` | Own data only | Optional; self sign-up by phone OTP (a guest books without one — revision 1.2) |
| `staff` | One outlet (`users.outlet_id`) | Admin |
| `owner` | One owner tenant (`users.owner_id`), read-mostly | Admin |
| `admin` | Entire platform | Seed script / other admin |
| `system` | Background jobs, webhooks (not a login) | n/a |

### 1.3 Permission matrix

| Capability | renter | staff | owner | admin |
|---|---|---|---|---|
| Browse outlets and availability | yes | yes | yes | yes |
| Create reservation, pay, view own voucher | yes (guests too, with `contactPhone` — revision 1.2) | no | no | no |
| Check-out, check-in, inspect, change bike state, report incident | no | own outlet | no | yes |
| View rentals, bikes, earnings, statements | own rentals | own outlet | own tenant | all |
| Set safety buffer, promo opt-out | no | no | own tenant | all |
| Raise payout dispute | no | no | own tenant | no |
| Onboard owners, outlets, bikes, users; pricing; promotions; commission rules | no | no | no | yes |
| Resolve an offline collateral/damage claim, resolve a flagged scan, resolve dispute, run settlement | no | no | no | yes |

### 1.4 System invariants (the three PRD rules, made testable)

- **INV-1 Station-to-station.** Every `bikes` row has non-null `home_outlet_id`, `current_outlet_id` and `state`. While `state = in_rental`, `current_outlet_id` keeps the outlet of the last confirmed scan.
- **INV-2 Booking-to-inventory lock.** Availability is decided only by the server inside a database transaction holding a row lock on `outlet_categories`. No client value, cache or sync job may grant a reservation.
- **INV-3 No dockless.** A rental changes to returned only through a staff `checkin` event. No renter-facing endpoint changes bike or rental state.
- **INV-4 Custody trail.** Every change to `bikes.state` or `bikes.current_outlet_id` writes exactly one `bike_events` row in the same transaction.
- **INV-5 Money.** All money is integer rupiah (`bigint`). No floats, no decimals, anywhere (DB, API, code).
- **INV-6 Append-only.** `bike_events`, `ledger_entries`, `audit_log`, `scan_events` and `payment_webhook_events` reject UPDATE and DELETE (DB trigger raising an exception).

### 1.5 Prohibited behavior (negative requirements)

- **NEG-1** No table, column or cache stores bike GPS or coordinates. Only `outlets` has `lat`/`lng`.
- **NEG-2** No endpoint returns individual bike locations or a bike map. Renter-facing endpoints return counts per category only, never bike ids or asset tags before check-out.
- **NEG-3** No endpoint lets a renter end a rental, change a bike state or confirm custody.
- **NEG-4** Renter coordinates sent for sorting MUST NOT be persisted or logged (redact `lat`, `lng` in pino).
- **NEG-5** No inter-owner transfer or settlement. Revenue accrues to the owner of the bike's home outlet.
- **NEG-6** No separately deployed services. One deployable API app; modules interact only through exported functions, never by importing another module's tables.
- **NEG-7** No push notifications (A-01). Channels are WhatsApp and email.
- **NEG-8** No renter cancellation endpoint and no renter-initiated refunds. The 50% DP is the only online payment; the balance is collected offline by staff. Any DP refund on no-show or reallocation is applied server-side per config (section 4).

### 1.6 Phase scope

| Phase | Modules and features |
|---|---|
| P1 | Identity, tenancy, guest checkout (optional auth), catalog, inventory lock, multi-bike reservation (`quantity`), mock payments through `FakeGateway`, 50% down payment, physical collateral logging at check-out, check-out/check-in/inspection, offline staff queue, hold expiry and no-show jobs, notifications, basic owner dashboard (live rentals, bike status counts, gross earnings accrual) |
| P2 | Ledger, commission rules, promotions, weekly statements and PDFs, Tuesday payouts, dispute queue, utilization and performance reports |
| P3 | Sister-outlet groups in production (`feature.sister_outlets_enabled = true`), e-bike category, optional Capacitor wrapper |

---

## 2. Technical Baseline (mandatory)

| Layer | Requirement |
|---|---|
| Language | TypeScript, `strict: true`, one language for all apps and packages |
| Repo | pnpm workspaces + Turborepo. `apps/api`, `apps/web`, `apps/staff`, `packages/db`, `packages/contracts`, `packages/config` |
| API | Node.js (current Active LTS), Fastify, Zod. REST over JSON, base path `/api/v1` |
| Database | PostgreSQL 16+. Drizzle ORM for queries and migrations; raw SQL for the reservation lock and capacity count |
| Jobs | Redis + BullMQ; timezone `Asia/Jakarta` for repeatable jobs |
| Web | Next.js (React), Tailwind, shadcn/ui, TanStack Query. Route groups `(renter)`, `(owner)`, `(admin)` |
| Staff app | Vite + React installable PWA, Dexie (IndexedDB), Workbox |
| Realtime | Server-Sent Events (SSE), Redis pub/sub between API instances |
| Auth | **Better Auth** (pinned). Verify plugin names and options against the installed version's docs at build time |
| Payments | **Phase 1 uses the `FakeGateway` exclusively** for every reservation, down-payment and refund flow (mock invoices, mock webhook verification). A real `XenditGateway` (Invoice API for collection, Disbursement API for payouts) implements the same `PaymentGateway` interface and is wired in only after gate G-01 and the Phase 2 money work |
| Files | S3-compatible storage, private buckets, presigned uploads |
| Messaging | WhatsApp Business API via a provider, plus email, behind a `NotificationProvider` interface |
| Observability | pino JSON logs with `requestId`, Sentry, `GET /healthz` (liveness), `GET /readyz` (Postgres and Redis reachable) |
| Testing | Vitest (unit, integration against real Postgres), Playwright (end to end), a concurrency script |
| Hosting | Managed containers, managed Postgres and Redis, Singapore or Jakarta region. No Kubernetes |

**Module layout** (`apps/api/src/modules/`): `identity`, `catalog`, `inventory`, `rental`, `pricing`, `payments`, `ledger`, `notifications`, `reporting`. Each exports functions from `index.ts` only.

**Database roles:**
- `app_rls`: used for owner-scoped requests. RLS enforced. Each transaction runs `SELECT set_config('app.owner_id', <uuid>, true)`.
- `app_service`: `BYPASSRLS`. Used for renter, staff, admin and system paths. Authorization is enforced in the application layer.

**Interfaces to implement (P1):** `PaymentGateway { createInvoice, getInvoice, refund, createDisbursement, verifyWebhook }`; `NotificationProvider { send(channel, template, to, vars) }`. (The former `VerificationProvider` was removed with FR-ID-04 in revision 1.2.)

---

## 3. Global Conventions

### 3.1 Data conventions

- IDs: UUID (`gen_random_uuid()`), lowercase string in JSON.
- Timestamps: `timestamptz`, stored UTC, serialized ISO 8601 with `Z`. Server time source is the database `now()`.
- Business-day and week logic: computed in `Asia/Jakarta` (WIB, UTC+7). Week key `YYYY-Www` is the ISO week of the WIB date.
- Money: `bigint` rupiah. Currency is always IDR and is not a field.
- Rounding: `roundHalfUp(n/d)` for commission; `floor` for owner shares of splits (platform takes the remainder). Both are pure functions in `modules/ledger/money.ts`.
- Time windows are half-open `[starts_at, ends_at)`. Two windows overlap iff `a.start < b.end AND b.start < a.end`.

### 3.2 API conventions

- Auth: Better Auth session cookie (`HttpOnly; Secure; SameSite=Lax`). Unauthenticated: 401. Authenticated but not permitted: 403. A resource outside the caller's scope returns 404 (never 403) to avoid leaking existence.
- Single resource: the JSON object. List: `{ "data": [...], "nextCursor": string|null }`; query `limit` (V-LIMIT) and `cursor` (V-CURSOR); order `created_at DESC, id DESC` unless stated.
- Error body (all non-2xx): `{ "error": { "code": string, "message": string, "details": [{ "path": string, "issue": string }]?, "requestId": string } }`.
- `Idempotency-Key` header (UUID) is REQUIRED on `POST /reservations` and `POST /reservations/{id}/reallocate`. Same key and same body within 24 h returns the stored response with header `Idempotent-Replay: true`. Same key, different body: 422 `IDEMPOTENCY_KEY_REUSED`. Same key while the first request runs: 409 `IDEMPOTENCY_IN_PROGRESS`. Stored in `idempotency_keys`. For a guest booking the key is scoped to `contactPhone` instead of `user_id` (revision 1.2).
- Rate limits (Redis, per IP unless noted): anonymous 120 req/min; authenticated 600 req/min per user; exceeded: 429 `RATE_LIMITED` with `Retry-After`.

### 3.3 Error code catalog

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED`, `OTP_INVALID`, `WEBHOOK_SIGNATURE_INVALID` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `SOLD_OUT`, `STATE_CONFLICT`, `DUPLICATE_RESOURCE`, `IDEMPOTENCY_IN_PROGRESS`, `SCAN_FLAGGED`, `MULTI_OUTLET_DISABLED` |
| 422 | `OUTSIDE_OPENING_HOURS`, `DURATION_OUT_OF_RANGE`, `WINDOW_OUT_OF_RANGE`, `CATEGORY_NOT_OFFERED`, `PROMO_INVALID`, `AMOUNT_BELOW_MINIMUM`, `VOUCHER_INVALID`, `VOUCHER_EXPIRED`, `IDEMPOTENCY_KEY_REUSED`, `DISPUTE_WINDOW_CLOSED` |
| 429 | `RATE_LIMITED` |
| 500 / 502 / 503 | `INTERNAL`, `GATEWAY_UNAVAILABLE` |

### 3.4 Validation dictionary (referenced as V-xx)

- **V-UUID:** lowercase RFC 4122 UUID.
- **V-TS:** ISO 8601 UTC datetime ending in `Z`; invalid or non-UTC offset is rejected.
- **V-IDR:** integer, `0 <= n <= 1000000000`.
- **V-CAT:** exists in `categories.code`; regex `^[a-z0-9_]{2,16}$`.
- **V-PHONE:** input normalized (`08xx` becomes `+628xx`, `628xx` becomes `+628xx`), then must match `^\+62[0-9]{8,13}$`.
- **V-EMAIL:** lowercased, 3 to 254 chars, valid address.
- **V-PASSWORD:** 12 to 128 characters.
- **V-TEXT-S:** trimmed string, 1 to 200 chars. **V-TEXT-L:** trimmed string, 10 to 2000 chars.
- **V-LAT / V-LNG:** number in `[-90, 90]` / `[-180, 180]`.
- **V-ASSET-TAG:** `^JMB-[0-9]{3}-[A-Z]{3}-[0-9]{3}$`, globally unique.
- **V-OUTLET-CODE:** `^JMB-[0-9]{3}$`, globally unique.
- **V-PROMO:** uppercased, `^[A-Z0-9]{4,16}$`.
- **V-PHOTO-KEY:** `^uploads/(checklist|damage)/[0-9a-f-]{36}\.(jpg|png|webp)$`. The server MUST `HEAD` the object: it must exist and be at most 5 MiB.
- **V-CLIENT-EVENT-ID:** UUID v4, generated on the client.
- **V-CHECKLIST:** object with exactly the keys `frame`, `brakes`, `tires`, `chain`, `saddle`, `handlebar_gears`, each one of `ok`, `minor_issue`, `damaged`. All keys required (A-02).
- **V-QTY:** integer, 1 to `booking.max_quantity` (default 5). Number of bikes one reservation locks.
- **V-COLLATERAL:** object `{type: "ktp"|"sim"|"vehicle", reference: V-TEXT-S}`. `reference` is a masked identifier (e.g. the last 4 digits of a KTP/SIM number) or a plate number. Only the masked reference is stored; the full document number is never persisted.
- **V-HOURS:** object keys `mon..sun`, each an array of 0 to 2 intervals `{open:"HH:MM", close:"HH:MM"}`, 24 h, minutes in multiples of 15, `open < close`, no overlaps. Interpreted in WIB.
- **V-WEEK:** `^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$`.
- **V-LIMIT:** integer 1 to 100, default 25. **V-CURSOR:** opaque string, max 256 chars.

---

## 4. Configuration Parameters

Stored in table `app_config(key text PK, value jsonb, updated_by, updated_at)`, read through `getConfig(key)` with a 30 s in-process cache, changed only by admin (audit logged). **FIXED** = stated by PRD. **TBD** = not decided; FIXTURE is for seed and tests only.

| Key | Status | Value / FIXTURE |
|---|---|---|
| `hold.checkout_minutes` | FIXED | 15 |
| `noshow.grace_minutes` | FIXED | 60 |
| `commission.default_rate_bps`, `commission.default_base` | FIXED | 1800, `pre_discount` (seeded as a `commission_rules` row) |
| `promo.owner_share_bps` | FIXED | 5000 (0 if owner opted out) |
| `late.owner_share_bps` | FIXED | 5000 |
| `payout.min_idr` | FIXED | 100000 |
| `dispute.raise_window_days`, `dispute.resolve_business_days` | FIXED | 7, 3 |
| `sync.interval_minutes`, `sync.drift_max_pct` | FIXED | 5, 1 |
| `pricing.billing_unit_minutes` | TBD | 60 |
| `pricing_rules` (rate per unit, per category, per day type) | TBD | weekday: commuter 10000, road 20000, mtb 15000, fixie 10000; weekend: commuter 15000, road 30000, mtb 20000, fixie 15000 |
| `booking.slot_minutes` | TBD | 15 |
| `booking.min_duration_minutes` / `max_duration_minutes` | TBD | 60 / 1440 |
| `booking.max_advance_days` / `min_lead_minutes` | TBD | 7 / 0 |
| `booking.max_quantity` | TBD | 5 (max bikes in one reservation) |
| `booking.max_active_reservations_per_phone` | TBD | 3 (anti-spam backstop for guest checkout; A-19) |
| `booking.dp_rate_bps` | FIXED | 5000 (50% down payment collected online; balance collected offline) |
| `checkout.early_minutes` | TBD | 0 |
| `late.grace_minutes` | TBD | 15 |
| `late.fee_per_30min_idr` | TBD | 20000 (per started 30 min after grace) |
| `late.collection_method` | TBD | `payment_intent` (generate an invoice) or `offline_cash` (collected by staff at check-in); FIXTURE `payment_intent` |
| `late.escalation_minutes` | TBD | `{reminder:0, staff_call:30, owner_flag:60, claim_eligible:240}` minutes after `expected_end_at` |
| `penalty.lost_unit_idr` | TBD | 4000000 (lost or unreturned unit; settled offline against collateral) |
| `claims.owner_share_bps` | TBD | 10000 |
| `condition.min_photos` / `max_photos` | TBD | 1 / 8 |
| `qr.voucher_ttl_seconds` | TBD | 60 |
| `reallocation.response_minutes` | TBD | 30 |
| `payments.min_charge_idr` | TBD | 10000 |
| `noshow.refund_policy` | TBD | `full_refund` or `retain_full`; FIXTURE `full_refund` (A-03) |
| `reports.repeat_fault_threshold` / `window_days` | TBD | 3 / 90 |
| `holidays` | TBD | `[]` (dates excluded from business days) |
| `feature.sister_outlets_enabled` | P3 flag | false |

**Seed fixtures:** outlet `lat`/`lng` and `hours` are not in the PRD. Seed placeholders near Jambi (about -1.61, 103.61) with hours Monday to Sunday 07:00 to 19:00, marked FIXTURE and replaced with real data before launch. Bike asset tags: `JMB-<outlet 3 digits>-<COM|ROD|MTB|FIX>-<001..>`.

**Seed pricing is mock data, not policy.** Every rate, tier and penalty value in this table (weekday/weekend rental rates, `late.fee_per_30min_idr`, `penalty.lost_unit_idr`, the DP rate and every other TBD) is a **configurable seed/mock value** used only to bootstrap demos and tests. No amount may be hard-coded in business logic: the values live in `app_config` and `pricing_rules` and are read through `getConfig` / the FR-PRC-01 rate lookup. Owners may set their own pricing per outlet, category and day type via `POST /admin/pricing-rules`; the admin may change any value via `PATCH /admin/config`. T-10 MUST pass with any configured value, not with the fixtures above.

---

## 5. Data Model

Conventions: every table has `id uuid PK DEFAULT gen_random_uuid()` and `created_at timestamptz NOT NULL DEFAULT now()` unless noted. `owner_id` on a table means RLS applies (section 6, FR-ID-03). Enums are Postgres enums except `categories`, which is a lookup table so adding `ebike` is a data change.

```
categories(code text PK, name text, attributes_schema jsonb NULL)           -- seed: commuter, road, mtb, fixie
owners(name text NOT NULL, bank_code text, bank_account_number text, bank_account_name text,
       promo_opt_out boolean NOT NULL DEFAULT false, status text CHECK IN ('active','suspended'))
users(Better Auth `user` table + additional fields: role text NOT NULL, owner_id uuid NULL, outlet_id uuid NULL, phone text UNIQUE NULL)
   CHECK (role='staff' → outlet_id NOT NULL), CHECK (role='owner' → owner_id NOT NULL)
outlets(owner_id, code text UNIQUE, name, description text NULL, address text, lat numeric(9,6), lng numeric(9,6), hours jsonb, status text CHECK IN ('active','inactive'))
outlet_categories(outlet_id, category → categories, safety_buffer smallint NOT NULL DEFAULT 0 CHECK (0..1),
       active boolean NOT NULL DEFAULT true, PRIMARY KEY (outlet_id, category))   -- the lock row
sister_groups(owner_id, name) ; sister_group_outlets(group_id, outlet_id)          -- data only until P3
bikes(owner_id, asset_tag text UNIQUE, category → categories, home_outlet_id NOT NULL, current_outlet_id NOT NULL,
      state bike_state NOT NULL DEFAULT 'available', attributes jsonb NULL)
bike_events(bike_id, owner_id, type bike_event_type NOT NULL, from_state bike_state NULL, to_state bike_state NULL,
      outlet_id NOT NULL, staff_id uuid NULL, rental_id uuid NULL, client_event_id uuid NULL UNIQUE,
      photo_keys text[] NOT NULL DEFAULT '{}', payload jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL)
scan_events(client_event_id uuid UNIQUE NOT NULL, staff_id, outlet_id, type text, payload jsonb, occurred_at timestamptz,
      received_at timestamptz DEFAULT now(), status CHECK IN ('applied','flagged','rejected'), flag_reason text NULL,
      resolved_by uuid NULL, resolved_at timestamptz NULL)
renters(user_id uuid UNIQUE NULL → users, phone text UNIQUE NOT NULL)   -- guest: user_id NULL, phone is the identity (revision 1.2)
pricing_rules(outlet_id NULL, category, day_type pricing_day_type NOT NULL DEFAULT 'all', rate_idr bigint CHECK (>0), effective_from timestamptz)
promotions(code text UNIQUE, kind CHECK IN ('percent','fixed'), value bigint, max_discount_idr bigint NULL,
      starts_at, ends_at, category NULL, outlet_id NULL, max_uses int NULL, max_uses_per_renter int NULL, active boolean)
reservations(renter_id, outlet_id, owner_id, category, quantity smallint NOT NULL DEFAULT 1 CHECK (quantity >= 1),
      starts_at, ends_at, CHECK (ends_at > starts_at),
      status reservation_status NOT NULL, expires_at timestamptz NULL, confirmed_at NULL,
      price_idr bigint, discount_idr bigint DEFAULT 0, final_idr bigint, dp_idr bigint NOT NULL DEFAULT 0, promo_id NULL,
      owner_promo_bps int NOT NULL, rate_snapshot jsonb,            -- {rateIdr, unitMinutes, dayType}, immutable after insert
      at_risk boolean NOT NULL DEFAULT false, reallocation_deadline_at timestamptz NULL, cancel_reason text NULL)
   INDEX (outlet_id, category, status, starts_at, ends_at)
rentals(reservation_id, renter_id, bike_id, owner_id, checkout_outlet_id, checked_out_at, expected_end_at,
      checked_in_at NULL, checkin_outlet_id NULL, status rental_status NOT NULL DEFAULT 'open',
      collateral jsonb NOT NULL DEFAULT '{}',                        -- {type: ktp|sim|vehicle, reference}, logged at check-out
      balance_collected_idr bigint NOT NULL DEFAULT 0,               -- offline 50% collected at check-out
      balance_method text NULL CHECK (balance_method IN ('cash','qris')),
      late_minutes int NULL, late_fee_idr bigint NOT NULL DEFAULT 0, mechanical_failure boolean NOT NULL DEFAULT false,
      escalation_stage smallint NOT NULL DEFAULT 0 CHECK (0..4), checkout_checklist jsonb, checkin_checklist jsonb NULL,
      completed_at NULL)
   INDEX (reservation_id)                                          -- many rentals per reservation (multi-bike)
   UNIQUE INDEX (bike_id) WHERE status = 'open'                    -- DB guard: one open rental per bike
payment_intents(purpose payment_purpose, renter_id, reservation_id NULL, rental_id NULL, amount_idr bigint CHECK (>0),
      status payment_status, gateway text DEFAULT 'fake', gateway_ref text NULL, payment_url text NULL, expires_at NULL)
payment_webhook_events(provider text, event_id text, raw jsonb, received_at, processed_at NULL, UNIQUE (provider, event_id))
refunds(payment_intent_id, reservation_id NULL, rental_id NULL, amount_idr bigint CHECK (>0),
      reason CHECK IN ('mechanical_failure','reallocation_declined','late_payment_sold_out','no_show','dispute'),
      gateway_ref NULL, status CHECK IN ('pending','succeeded','failed'))
idempotency_keys(key uuid, user_id uuid NULL, guest_phone text NULL, request_hash text, response jsonb NULL, status_code int,
      CHECK ((user_id IS NULL) <> (guest_phone IS NULL)),
      UNIQUE NULLS NOT DISTINCT (key, user_id, guest_phone))    -- guests scope the key to contactPhone (revision 1.2)
outbox_events(type text, payload jsonb, dispatched_at NULL)         -- transactional outbox for in-process event bus
-- Phase 2
commission_rules(owner_id NULL, rate_bps int CHECK (0..10000), base CHECK IN ('pre_discount','post_discount'), effective_from)
ledger_entries(owner_id, outlet_id NULL, rental_id NULL, type ledger_type, amount_idr bigint NOT NULL,   -- signed, owner perspective
      group_id uuid NOT NULL, week_key text NOT NULL, ref text NULL)
statements(owner_id, week_key, opening_balance_idr, gross_idr, commission_idr, promo_idr, late_fee_idr, refund_idr, claim_idr,
      adjustment_idr, net_idr, payout_idr, carry_idr, pdf_key text, UNIQUE (owner_id, week_key))
payouts(owner_id, week_key, amount_idr bigint CHECK (>0), status CHECK IN ('pending','submitted','paid','failed'),
      gateway_ref NULL, paid_at NULL, UNIQUE (owner_id, week_key))
disputes(owner_id, payout_id, reason text, status CHECK IN ('open','upheld','rejected'), raised_at, due_at, resolved_by NULL,
      resolved_at NULL, resolution_note NULL)
-- Platform
notifications(user_id NULL, channel CHECK IN ('whatsapp','email'), template text, vars jsonb, status CHECK IN ('queued','sent','failed'),
      attempts int DEFAULT 0, last_error text NULL)
inventory_drift_checks(outlet_id, checked_at, expected jsonb, reported jsonb, drift_pct numeric(5,2))
audit_log(actor_id NULL, actor_role text, action text, entity text, entity_id uuid NULL, before jsonb NULL, after jsonb NULL)
```

**Enums**

- `bike_state`: `available`, `held`, `reserved`, `in_rental`, `pending_inspection`, `maintenance`, `unavailable`, `charging`.
- `bike_event_type`: `registered`, `checked_out`, `checked_in`, `inspected`, `state_changed`, `incident_reported`.
- `reservation_status`: `held`, `confirmed`, `fulfilled`, `expired`, `cancelled`, `no_show`.
- `rental_status`: `open`, `returned`, `completed`.
- `payment_purpose`: `booking`, `late_fee`. `payment_status`: `created`, `pending`, `paid`, `failed`, `expired`, `refunded`.
- `pricing_day_type`: `all`, `weekday`, `weekend`.
- `collateral_type`: `ktp`, `sim`, `vehicle`.
- `ledger_type`: `rental_revenue`, `platform_commission`, `promo_share`, `late_fee_share`, `refund_reversal`, `damage_claim_credit`, `manual_adjustment`, `payout` (P2; the last three extend the tech document list, A-04).

**A-05 Bike states `held` and `reserved`.** They exist in the enum per the PRD but are unused in P1 to P3: reservations are category-level (tech document 5.2) and a bike is bound only at check-out. A reservation locks a **count** of bikes (`quantity`) under one category row, not specific bikes. The owner dashboard shows held and reserved as per-category counts derived from `reservations` (sum of `quantity`), not from `bikes.state`. No code path may set `bikes.state` to `held` or `reserved`.

### 5.1 State machines

**Bike state transitions** (the only allowed ones; anything else throws `STATE_CONFLICT`):

| From | To | Trigger | Actor |
|---|---|---|---|
| `available` | `in_rental` | FR-RNT-01 check-out | staff |
| `in_rental` | `pending_inspection` | FR-RNT-02 check-in | staff |
| `pending_inspection` | `available` | FR-RNT-03 inspection `pass` | staff |
| `pending_inspection` | `maintenance` | FR-RNT-03 inspection `damage_found` or `maintenance_required` | staff |
| `available` | `maintenance` | FR-INV-04 `bike_damaged` | staff, admin |
| `available` | `unavailable` | FR-INV-04 `bike_missing`, or manual | staff, admin |
| `maintenance` | `available` | manual `bike_status_change` | staff, admin |
| `unavailable` | `available` | manual `bike_status_change` | admin |
| `available`, `maintenance` | `charging` and back | reserved for e-bikes (P3) | n/a |

**Reservation:** `held` → `confirmed` (50% DP paid, or `dp_idr = 0`) | `expired` (hold lapsed, payment failed) | `cancelled` (gateway failure at creation, reallocation). `confirmed` → `fulfilled` (check-out of all `quantity` bikes) | `no_show` (start + 60 min) | `cancelled` (reallocation accepted or declined).

**Rental:** `open` → `returned` (check-in) → `completed` (inspection confirmed).

---

## 6. Functional Requirements

Each requirement lists atomic sub-tasks in execution order, then validation and errors, then acceptance criteria (AC) written so a unit or integration test can be derived directly.

### 6.1 Identity and Tenancy

#### FR-ID-01 Renter sign-in by phone OTP — optional [P1]
Sign-in is optional (revision 1.2): a guest books with a `contactPhone` only (FR-INV-02) and the 50% down payment is the primary anti-spam and no-show control. A renter account exists primarily to claim platform and owner promotions and vouchers, and secondarily to see booking history.
Better Auth phone-number plugin; OTP delivered by WhatsApp through `NotificationProvider`.
1. Normalize and validate `phone` (V-PHONE).
2. Enforce limits: at most 1 OTP per phone per 60 s, 5 per phone per hour, 20 per IP per hour. Otherwise 429 `RATE_LIMITED`.
3. Generate a 6-digit numeric OTP with a CSPRNG. Store only its hash. TTL 300 s.
4. Send via WhatsApp template `otp`.
5. On verify: at most 5 wrong attempts per OTP, then the OTP is invalidated. A wrong, expired or used OTP returns 401 `OTP_INVALID`.
6. On first successful verify, in one transaction create the `users` row (role `renter`) and the `renters` row. If a guest `renters` row with the same phone already exists (`user_id = NULL`), link it by setting `user_id` instead of inserting a duplicate row (A-17): the phone is the booking identity across guest and authenticated use.
7. Issue a session (TTL 30 days, sliding).
- **AC:** 6th OTP request within an hour returns 429. A correct OTP after 5 wrong attempts still returns 401. Inputs `081234567890`, `6281234567890` and `+6281234567890` all normalize to `+6281234567890` and resolve to the same user. A guest reservation booked with phone X is visible to the account later created from the same phone X.

#### FR-ID-02 Staff, owner, admin sign-in [P1]
1. Accounts are created only by admin (`POST /admin/users`); public sign-up for these roles is disabled.
2. Login with email and password (V-EMAIL, V-PASSWORD). After 5 failures in 15 min for one email, lock that email for 15 min (429 `RATE_LIMITED`).
3. Session TTL: staff 12 h, owner 7 days, admin 8 h (absolute, non-sliding).
4. Every request resolves `role`, `owner_id`, `outlet_id` from the session; a staff request that names another outlet returns 404.
- **AC:** staff user of JMB-001 calling `GET /staff/outlet/bikes` sees only JMB-001 bikes.

#### FR-ID-03 Owner isolation [P1]
1. RLS enabled on `outlets`, `outlet_categories`, `bikes`, `bike_events`, `reservations`, `rentals`, `ledger_entries`, `statements`, `payouts`, `disputes`.
2. Policy per table: `USING (owner_id = current_setting('app.owner_id')::uuid)`. Role `app_rls` has no `BYPASSRLS`.
3. Every owner endpoint runs in a transaction that first calls `set_config('app.owner_id', ownerId, true)`, and repository helpers require `ownerId` as a parameter (compile-time, no default).
- **AC (T-02):** owner A's session cannot read, via any owner endpoint or direct `app_rls` SQL, any row of owner B's outlets, bikes or ledger; the response is 404 or zero rows.

#### FR-ID-04 (removed) Renter ID verification
Removed in revision 1.2 (conversion-rate optimization). There is **no** digital ID verification: the `verification_requests` and `id_document_views` tables, the `VerificationProvider` interface, `POST /renters/me/id-documents/upload-url`, `POST /renters/me/verification`, the admin verification queue, the `verification_status` column and the `verification_result` notification template do not exist, and `POST /reservations` never returns 422 `VERIFICATION_REQUIRED`. A renter's good faith is secured by (a) the 50% down payment (FR-INV-02) — the primary anti-spam and no-show control — and (b) the physical collateral (KTP, SIM or vehicle) that staff collect and log offline at check-out (FR-RNT-01, V-COLLATERAL). No digital identity document is ever uploaded, stored or reviewed by the platform.

#### FR-ID-05 (removed) Digital security deposit
Removed in revision 1.1. There is **no** digital deposit: the `deposits` and `deposit_claims` tables, the `deposit_status` enum, `POST /renters/me/deposit`, `POST /admin/renters/{id}/deposit/release` and `PATCH /admin/deposit-claims/{id}` do not exist. A renter's good faith is secured by (a) the 50% down payment (FR-INV-02) and (b) the physical collateral collected at check-out (FR-RNT-01). Damage discovered at check-in is settled offline against that collateral (FR-RNT-03).

### 6.2 Catalog

#### FR-CAT-01 Outlet discovery [P1]
1. `GET /outlets` query `lat?` (V-LAT), `lng?` (V-LNG) (both or neither, else 400), `category?` (V-CAT).
2. Return only `status = active` outlets. For each active `outlet_categories` row where at least one bike is homed there, return `availableNow` per category (FR-INV-01 with window `[now, now + booking.min_duration_minutes)`). Categories with zero bikes at the outlet are omitted (JMB-002 and JMB-004 show no road bikes).
3. If lat/lng given: `distanceKm` by haversine, 1 decimal, sorted ascending; else sorted by `name`. Coordinates are not stored or logged (NEG-4).
4. Item fields: `id, code, name, description, address, lat, lng, hours, isOpenNow, distanceKm?, availability: {category: n}`. No bike ids.
- **AC:** with category filter `road`, JMB-002 and JMB-004 are not returned.

#### FR-CAT-02 Admin onboarding [P1]
1. `POST /admin/owners`: `name` (V-TEXT-S), `bankCode` (V-TEXT-S), `bankAccountNumber` (`^[0-9]{6,20}$`), `bankAccountName` (V-TEXT-S).
2. `POST /admin/outlets`: `ownerId`, `code` (V-OUTLET-CODE), `name`, `address` (V-TEXT-S), `description?` (V-TEXT-L, outlet character, e.g. cargo-rack commuters at JMB-004), `lat`, `lng`, `hours` (V-HOURS), `categories: V-CAT[]` (non-empty). Creates `outlet_categories` rows. If `feature.sister_outlets_enabled = false` and the owner already has an outlet: 409 `MULTI_OUTLET_DISABLED`. Duplicate `code`: 409 `DUPLICATE_RESOURCE`.
3. `POST /admin/bikes` (and `/admin/bikes/bulk`, max 200 items, all-or-nothing): `assetTag` (V-ASSET-TAG), `category`, `homeOutletId`. Category must exist in the outlet's `outlet_categories` (else 422 `CATEGORY_NOT_OFFERED`). Insert with `current_outlet_id = home_outlet_id`, `state = available`, `owner_id` copied from the outlet, plus a `registered` bike event.
4. All admin mutations write `audit_log`.
- **AC:** seed script creates exactly 4 owners, 4 outlets, 150 bikes matching the section 1.1 table.

### 6.3 Pricing and Promotions

#### FR-PRC-01 Price quote [P1]; promotions [P2]
Pure function `quote({outletId, category, startsAt, endsAt, promoCode?, renterId}) → {priceIdr, discountIdr, finalIdr, rateSnapshot, promoId, ownerPromoBps}`.
1. `dayType` = `weekend` when the WIB date of `startsAt` is Saturday or Sunday, else `weekday`. Rate: the latest `pricing_rules` with `effective_from <= now()` matching `(outlet_id, category, dayType)`, else `(NULL, category, dayType)`, else `(outlet_id, category, 'all')`, else `(NULL, category, 'all')`; none: 422 `CATEGORY_NOT_OFFERED`. `rateSnapshot` records `{rateIdr, unitMinutes, dayType}`.
2. `units = ceil(durationMinutes / pricing.billing_unit_minutes)`; `priceIdr = rateIdr * units`.
3. Promo (P2; P1 ignores `promoCode`, returning `PROMO_INVALID` if supplied): active, `starts_at <= now() < ends_at`, scope matches, `max_uses` and `max_uses_per_renter` not exceeded. A `promoCode` is accepted only for an authenticated session; an unauthenticated request supplying one returns 401 `UNAUTHENTICATED` (revision 1.2, incentivized auth). `percent`: `discount = min(floor(price * value / 100), max_discount_idr ?? price)`; `fixed`: `min(value, price)`. `percent` value must be 1 to 100.
4. `finalIdr = priceIdr - discountIdr`. `ownerPromoBps = owner.promo_opt_out ? 0 : promo.owner_share_bps`.
5. If `0 < finalIdr < payments.min_charge_idr`: 422 `AMOUNT_BELOW_MINIMUM`.
- **AC:** weekday rate 10000, unit 60, window 90 min gives 20000; the same window on a Saturday uses the weekend rate 15000 and gives 30000. Percent 25 on 20000 gives discount 5000, final 15000. Window 61 min gives 2 units.

### 6.4 Inventory and Reservation (the lock)

#### FR-INV-01 Availability computation [P1]
Function `computeAvailability(tx, {outletId, category, startsAt, endsAt, excludeReservationId?})`.
1. `inService` = bikes with `home_outlet_id = outletId`, matching `category`, `state NOT IN ('maintenance','unavailable')`.
2. `buffer` = `outlet_categories.safety_buffer`.
3. `committedReservations` = the **sum of `quantity`** over reservations at `(outletId, category)` overlapping the window where (`status = held AND expires_at > now()`) OR (`status = confirmed AND at_risk = false AND starts_at + noshow.grace_minutes > now()`), excluding `excludeReservationId`. A reservation therefore commits `quantity` bikes, not one.
4. `committedRentals` = `open` rentals whose bike is homed at `outletId` with that category and (`expected_end_at > startsAt` OR `expected_end_at <= now()`). An overdue open rental counts as running until its staff check-in, so a late bike is never double-booked.
5. `available = max(0, inService - buffer - committedReservations - committedRentals)`. The result is a **count of free bikes**; a request proceeds only when `available >= reservation.quantity`.
- Conservative by design: it counts every overlapping reservation even when two of them do not overlap each other. This can under-report availability but never over-report it.
- **AC (T-01 set):** inService 5, buffer 0, four overlapping confirmed reservations of `quantity` 1, 0 rentals: available 1. With inService 5 and no other commitments, one confirmed reservation of `quantity` 3 leaves available 2, so a follow-up request of `quantity` 2 succeeds and one of `quantity` 3 fails `SOLD_OUT`. Reservation 10:00 to 11:00 does not overlap window 11:00 to 12:00. Buffer 1 with inService 5 and 0 committed: available 4. An overdue open rental counts against a window next week.

#### FR-INV-02 Create reservation (hold) [P1]
`POST /reservations`. Public — guest checkout (revision 1.2). Inputs: `outletId` (V-UUID), `category` (V-CAT), `quantity?` (V-QTY, default 1), `startsAt`, `endsAt` (V-TS), `promoCode?` (V-PROMO), `contactPhone?` (V-PHONE; REQUIRED when the request is unauthenticated, REJECTED with 400 when it is authenticated); header `Idempotency-Key`.
Pre-transaction validation, in this order (first failure returns):
1. Schema (400). Renter identity: an authenticated session resolves to the session's renter; an unauthenticated request resolves or creates the guest `renters` row keyed by `contactPhone` with `user_id = NULL` (A-17). `promoCode` on an unauthenticated request returns 401 `UNAUTHENTICATED` — promotions require an account (incentivized auth).
2. Phone guard (anti-spam backstop): the phone already holding `booking.max_active_reservations_per_phone` reservations in status `held` or `confirmed` returns 409 `DUPLICATE_RESOURCE` (A-19; the 50% DP remains the primary anti-spam and no-show control).
3. `endsAt > startsAt`; minutes of `startsAt` and duration are multiples of `booking.slot_minutes`; duration within `booking.min/max_duration_minutes` else 422 `DURATION_OUT_OF_RANGE`; `startsAt >= now + booking.min_lead_minutes` and `<= now + booking.max_advance_days` else 422 `WINDOW_OUT_OF_RANGE`.
4. `startsAt` and `endsAt` each fall inside the outlet's `hours` (WIB) else 422 `OUTSIDE_OPENING_HOURS`. Closed time between them is allowed.
5. Outlet active and `(outletId, category)` active else 422 `CATEGORY_NOT_OFFERED`.

Single database transaction (`READ COMMITTED`):
1. `SELECT 1 FROM outlet_categories WHERE outlet_id = $1 AND category = $2 FOR UPDATE`.
2. `computeAvailability`; if `available < quantity` throw 409 `SOLD_OUT`.
3. `quote()` (FR-PRC-01).
4. Compute the online down payment: `dpIdr = roundHalfUp(finalIdr * booking.dp_rate_bps / 10000)`. The offline balance is `balanceIdr = finalIdr - dpIdr`, collected by staff at check-out (FR-RNT-01).
5. Insert reservation: `status = held`, `quantity = quantity`, `dp_idr = dpIdr`, `expires_at = now() + hold.checkout_minutes`, price fields and snapshots copied from the quote. If `dpIdr = 0` insert `confirmed` directly and skip steps 6 to 7.
6. Insert `payment_intents(purpose = booking, amount = dpIdr, status = created, expires_at = reservation.expires_at)`.
7. Insert outbox event `reservation.held`. Commit.

After commit (never inside the lock): enqueue BullMQ job `release-hold` at `expires_at` (job id `hold:<reservationId>`); call `gateway.createInvoice({externalId: intent.id, amount, durationSeconds: 900})` with an 8 s timeout. Success: store `gateway_ref`, `payment_url`, status `pending`; respond 201 `{reservation, price, paymentUrl}` — plus `guestToken` (A-18) when the booking was made as a guest. Failure: set reservation `cancelled` (`cancel_reason = gateway_error`), intent `failed`, respond 502 `GATEWAY_UNAVAILABLE`.
- **AC (T-01, the protected rule):** an outlet with 5 commuter bikes and 50 parallel valid requests (each `quantity = 1`) for the same window yields exactly 5 responses 201 and 45 responses 409 `SOLD_OUT`; `computeAvailability` afterwards returns 0. With the same 5 bikes, one request of `quantity = 3` leaves `available = 2`; a follow-up request of `quantity = 3` returns `SOLD_OUT` and one of `quantity = 2` returns 201.

#### FR-INV-03 Hold expiry, no-show and sweeper [P1]
1. Delayed job `release-hold` runs at `expires_at`; sweeper job `sweeper` runs every minute. Both execute the same idempotent SQL; Redis loss never loses a booking.
2. Expire holds: `UPDATE reservations SET status = 'expired' WHERE status = 'held' AND expires_at <= now() RETURNING id`; set unpaid intents to `expired`; emit `reservation.released`.
3. No-show: `UPDATE ... SET status = 'no_show' WHERE status = 'confirmed' AND starts_at + noshow.grace_minutes <= now()`. Apply `noshow.refund_policy` to the online down payment (`dp_idr`): `full_refund` refunds the DP (FR-PAY-03, reason `no_show`); `retain_full` does nothing. Notify renter (`no_show`; for a guest booking, WhatsApp to the guest `contactPhone`). The released reservation stops counting its `quantity` on the next availability computation.
4. Sweeper also runs FR-RNT-04 escalation and FR-INV-04 reallocation deadlines.
- **AC:** a `held` row with `expires_at` 1 s in the past is `expired` after one sweeper run with Redis stopped. A `confirmed` reservation with `starts_at` 61 min ago becomes `no_show`; one 59 min ago does not.

#### FR-INV-04 Block a bike and reallocate [P1]
Trigger: staff event `incident` with `incidentType` `bike_missing` or `bike_damaged` (FR-RNT-05).
1. In one transaction: lock the bike row; set `unavailable` (missing) or `maintenance` (damaged); write `bike_events`.
2. Recompute availability for the bike's `(homeOutlet, category)`. While any reservation window has `committed > inService - buffer`, set `at_risk = true` on the overlapping `confirmed` reservation with the latest `created_at` (it then stops counting). Set `reallocation_deadline_at = min(now() + reallocation.response_minutes, starts_at)`. Reservations with `starts_at <= now()` are not touched.
3. Notify each affected renter (`reallocation_offer`) with a link to the choices.
4. `GET /reservations/{id}/alternatives`: outlets (any owner) with `availableNow >= quantity` for the same category and window, via `computeAvailability`.
5. `POST /reservations/{id}/reallocate` `{outletId}` (Idempotency-Key): run the FR-INV-02 lock at the target outlet (excluding checks that need payment), requiring `available >= quantity`. On success: original reservation `cancelled` (`cancel_reason = reallocated`), new reservation `confirmed` with `quantity`, `price_idr`, `discount_idr`, `final_idr`, `dp_idr` and `rate_snapshot` copied from the original (A-06), owner fields of the target outlet. No new payment (the DP is unchanged).
6. `POST /reservations/{id}/decline-reallocation`, or no response by `reallocation_deadline_at` (sweeper): reservation `cancelled`, full refund (reason `reallocation_declined`).
- **AC:** outlet has 3 road bikes and 3 overlapping confirmed reservations; marking one bike damaged flags exactly the latest-created reservation `at_risk`; a new booking attempt for that window returns `SOLD_OUT`.

#### FR-INV-05 Five-minute health sync and drift check [P1]
1. The staff app calls `POST /staff/health-sync` every `sync.interval_minutes` while online, first flushing its offline queue (FR-OFF-01). Body: `{sentAt: V-TS, physicalCounts?: {<V-CAT>: integer >= 0}}`.
2. Server computes `expected[category]` = bikes with `current_outlet_id = staffOutlet` and `state <> in_rental`.
3. If `physicalCounts` is present: `drift_pct = round(100 * sum|expected - reported| / max(sum expected, 1), 2)`; insert `inventory_drift_checks`. If `drift_pct > sync.drift_max_pct`: notify admin (`drift_alert`) and add an `audit_log` row.
4. The sync never grants or releases a reservation (INV-2).
- **AC:** expected `{commuter: 20}`, reported `{commuter: 19}` gives drift 5.00 and an alert; the reservation endpoints behave identically with the sync disabled.

### 6.5 Payments

Invoice creation (FR-PAY-01) is specified inside FR-INV-02; it is not a separate endpoint. In P1 the `FakeGateway` returns a mock `payment_url` and a mock paid webhook.

#### FR-PAY-02 Payment webhook [P1]
`POST /webhooks/{gateway}` (public, `gateway = fake` in P1, `xendit` after G-01).
1. Verify the callback token header with a constant-time comparison to the configured secret. Mismatch: 401 `WEBHOOK_SIGNATURE_INVALID`, nothing stored (confirm the exact mechanism against the gateway: a test header on the P1 `FakeGateway`, or the Xendit sandbox after G-01).
2. Insert raw payload into `payment_webhook_events`; on `UNIQUE (provider, event_id)` conflict return 200 immediately (duplicate).
3. Resolve the intent by `external_id`. Transaction, intent row locked `FOR UPDATE`. If already `paid`: no-op.
4. Verify `paid_amount == intent.amount_idr`; otherwise set the event `processed_at` with a failure note, alert admin, change nothing.
5. `PAID` for `booking` (this is the 50% DP, `amount_idr = reservation.dp_idr`): if the reservation is `held`: set `confirmed`, `confirmed_at = now()`, intent `paid`. If the reservation is `expired`: re-run FR-INV-02 steps 1 to 2 under the lock; if `available >= quantity` set `confirmed`; else refund the DP in full (reason `late_payment_sold_out`) and notify the renter. Emit `reservation.confirmed` and send `reservation_confirmed`.
6. `PAID` for `late_fee`: intent `paid`.
7. `EXPIRED` or `FAILED`: intent `expired`/`failed`; the sweeper handles the reservation.
8. Always respond 200 within 2 s after commit; unexpected errors return 500 so the gateway retries.
- **AC:** the same event delivered twice changes the DB once. A DP payment arriving after expiry with capacity below `quantity` produces exactly one refund row.

#### FR-PAY-03 Refunds [P1]
`issueRefund({intentId, amountIdr, reason, rentalId?})`:
1. Insert `refunds` row `pending`, with `amount_idr <= intent.amount_idr - already refunded` (else throw).
2. Call `gateway.refund` with idempotency key `refund-<refundId>`. On success: `succeeded`, intent `refunded` if fully refunded; on failure: `failed`, alert admin, retry only from the admin console.
3. Notify the renter (`refund_issued`). Emit outbox `refund.issued` (P2 ledger consumes it).

### 6.6 Rental Lifecycle

#### FR-OFF-01 Staff event ingestion and offline queue [P1]
All staff actions are events: `checkout`, `checkin`, `inspection`, `bike_status_change`, `incident`. Online and offline use the same endpoints (`POST /staff/events`, `POST /staff/events/batch`).
1. The staff PWA writes each event to IndexedDB (Dexie) with `clientEventId` (UUID v4) and `occurredAt` (device time, UTC), then sends it. Retry with backoff 5 s, 15 s, 60 s, 300 s (cap), in `occurredAt` order. Queue capacity 500 events; beyond that the UI blocks new scans with a visible warning.
2. Server, per event, in one transaction: insert into `scan_events` (`ON CONFLICT (client_event_id) DO NOTHING`). If it already existed: return the stored result (idempotent replay).
3. Classification: **rejected** (schema invalid, bad voucher signature, unknown bike or rental; nothing applied) / **flagged** (well-formed but physically impossible, see each FR; recorded, bike and rental state NOT changed, appears in the admin queue) / **applied**.
4. Online single event: applied 200; flagged 409 `SCAN_FLAGGED` with `reason`; rejected 400/422. Batch (max 50 events): 200 with per-item `{clientEventId, status, reason?}`.
5. Time-based rules use `occurredAt`, not receipt time.
- **AC:** posting the same checkout `clientEventId` twice yields one rental. A batch of 3 events replayed out of order is processed by ascending `occurredAt`.

#### FR-RNT-01 Check-out (handover) [P1]
Event `checkout`: `{clientEventId, occurredAt, voucherToken, bikeAssetTags (V-ASSET-TAG[], length = reservation.quantity), checklist (V-CHECKLIST), photoKeys (V-PHOTO-KEY[], condition.min_photos to max_photos), collateral (V-COLLATERAL), balanceCollection {amountIdr (V-IDR), method: cash|qris}}`.
1. Verify the token signature and `exp` (FR-SEC-01, tolerance 120 s against `occurredAt`); failure: `VOUCHER_INVALID` / `VOUCHER_EXPIRED` (rejected).
2. `bikeAssetTags` MUST contain exactly `reservation.quantity` distinct tags; otherwise rejected `QUANTITY_MISMATCH`. `collateral` is REQUIRED — staff physically collect a KTP, SIM or vehicle and log its masked reference — else rejected `COLLATERAL_REQUIRED`. `balanceCollection.amountIdr` MUST equal the offline balance `final_idr - dp_idr`; otherwise rejected `BALANCE_MISMATCH`.
3. Load the reservation (`FOR UPDATE`) and every listed bike (all `FOR UPDATE`, ordered by id).
4. Flag with these reasons if violated: `RESERVATION_NOT_CONFIRMED` (status not `confirmed`, e.g. already `no_show`), `WRONG_OUTLET` (reservation outlet or any bike `current_outlet_id` differs from the staff outlet), `CATEGORY_MISMATCH`, `BIKE_NOT_AVAILABLE` (any bike state not `available`), `TOO_EARLY` (`occurredAt < starts_at - checkout.early_minutes`).
5. Apply in one transaction: insert **one `rentals` row per bike tag** (`reservation_id`, `bike_id`, `expected_end_at = reservation.ends_at`, `checkout_checklist`, `collateral`, `balance_collected_idr`, `balance_method`); set each bike `in_rental` (`current_outlet_id` unchanged); reservation `fulfilled`; one `bike_events(checked_out, photo_keys)` per bike; outbox `rental.checked_out` per rental.
- **AC:** a `no_show` reservation scanned at the counter is flagged `RESERVATION_NOT_CONFIRMED`; no bike state changes. A reservation of `quantity = 2` checked out with two tags creates two `open` rentals sharing the reservation id and the same `collateral`, each with `balance_collected_idr = final_idr - dp_idr`.

#### FR-RNT-02 Check-in (return) [P1]
Event `checkin`: `{clientEventId, occurredAt, bikeAssetTag}`. No renter or phone involvement (INV-3). A multi-bike reservation is closed one bike at a time, each bike scanning its own check-in.
1. Find the `open` rental for the bike; none: flag `NO_OPEN_RENTAL`.
2. Flag `WRONG_OWNER_OUTLET` if the staff outlet's `owner_id` differs from the bike's `owner_id`. Same-owner returns to any outlet are allowed (PRD agreed decision).
3. Apply in one transaction: `rentals.checked_in_at = occurredAt`, `checkin_outlet_id`, `status = returned`; bike `pending_inspection`, `current_outlet_id = staff outlet`; `bike_events(checked_in)`.
4. Late calculation: `lateMinutes = max(0, floor((occurredAt - expected_end_at) / 60 s))`. If `mechanical_failure` or `lateMinutes <= late.grace_minutes`: fee 0. Else `late_fee_idr = ceil(lateMinutes / 30) * late.fee_per_30min_idr` (seed Rp 20,000 per started 30 min). Store both.
5. If `late_fee_idr > 0`: collect per `late.collection_method`: `payment_intent` creates a `payment_intents(late_fee)` invoice and notifies the renter, or `offline_cash` records that staff collected it at the counter (a `payment_intents(late_fee)` row marked `paid`). There is no deposit to deduct from.
- **AC:** expected end 12:00, grace 15, rate 20000 per started 30 min: check-in 12:15 gives fee 0; 12:16 gives 20000; 13:01 gives 40000.

#### FR-RNT-03 Inspection and completion [P1]
Event `inspection`: `{clientEventId, occurredAt, rentalId, result: pass|damage_found|maintenance_required, checklist (V-CHECKLIST), photoKeys, damageDescription?}`.
1. The rental must be `returned`, else flag `NOT_RETURNED`. If `mechanical_failure = true`, `result` must be `maintenance_required` or `damage_found`, else flag `RESULT_MISMATCH`.
2. `damage_found` requires `damageDescription` (V-TEXT-L) and at least 1 photo.
3. Apply: `pass` sets bike `available`; others set `maintenance`. Set `rentals.status = completed`, `completed_at`. `bike_events(inspected)`. Outbox `rental.completed` (consumed by reporting P1 and ledger P2).
4. Damage is settled **offline against the physical collateral** logged at check-out (FR-RNT-01); the platform keeps no in-system claim table. If the owner and admin agree a credit, an admin posts a signed `manual_adjustment`/`damage_claim_credit` (P2, FR-LED-01 step 6) to the owner ledger.
- **AC:** inspection `pass` after check-in makes the bike bookable again; `damage_found` removes it from `inService` in `computeAvailability`.

#### FR-RNT-04 Overdue escalation [P1]
Sweeper evaluates `open` rentals every minute; `escalation_stage` only increases.
1. Stage 1 `reminder` at `expected_end_at + late.escalation_minutes.reminder`: WhatsApp to renter (`late_reminder`).
2. Stage 2 `staff_call` at `.staff_call`: appears in the staff app list "Call renter" (`GET /staff/outlet/overdue`).
3. Stage 3 `owner_flag` at `.owner_flag`: notify owner (`owner_late_flag`) and flag in the dashboard.
4. Stage 4 `claim` at `.claim_eligible`: appears in the admin dispute queue as `claim_eligible`; admin decides. If the unit is lost, the seed `penalty.lost_unit_idr` is recorded and settled offline against the renter's physical collateral (no automatic charge).
5. Late fees accrue until the staff check-in (FR-RNT-02). Rentals with `mechanical_failure = true` skip stages 1 to 4.
- **AC:** with config `{0,30,60,240}` and a rental 65 min overdue, the sweeper sets stage 3 once and sends one owner notification across repeated runs.

#### FR-RNT-05 Incidents [P1]
Event `incident`: `{clientEventId, occurredAt, incidentType: mechanical_failure|bike_missing|bike_damaged, bikeAssetTag, rentalId?, notes (V-TEXT-L), photoKeys?}`.
1. `mechanical_failure` requires an `open` rental (else flag `NO_OPEN_RENTAL`): set `mechanical_failure = true`, issue a full refund of the online DP (`dp_idr`) to the renter (FR-PAY-03, reason `mechanical_failure`); staff return the offline balance in cash. Notify renter. The bike stays `in_rental` until check-in, then moves to `maintenance` through inspection (FR-RNT-03).
2. `bike_missing` / `bike_damaged`: bike must be `available` or `pending_inspection`; run FR-INV-04.
3. Write `bike_events(incident_reported)` in all cases.

### 6.7 Realtime and Owner Dashboard

#### FR-REP-01 Owner dashboard [P1 basic, P2 full]
All endpoints use the owner transaction context (FR-ID-03).
- **P1:** `GET /owner/dashboard/summary` returns, per outlet and category: counts of bikes by `state`, `heldCount` and `confirmedCount` (the **sum of `quantity`** over `reservations` overlapping now), open rentals list (`bikeAssetTag`, `renterPhoneMasked`, `checkedOutAt`, `expectedEndAt`, `overdue`, `escalationStage`), late returns, and `grossAccruedIdr` for the current WIB week = sum of `price_idr` of rentals completed this week (before commission, labeled gross).
- **P2 reports** (`GET /owner/reports/*`, query `from`, `to` as WIB dates, max range 366 days):
  - Utilization = rented bike-hours / in-service bike-hours, per category and outlet. A bike-hour is rented when between `checked_out_at` and `checked_in_at` (or now if open), clipped to the period; in-service excludes time in `maintenance` or `unavailable`, derived from `bike_events` state history.
  - Peak hours: check-out count by WIB hour (0 to 23) and weekday.
  - Average rental length: mean minutes of `checked_in_at - checked_out_at` for `completed` rentals.
  - Repeat-fault bikes: bikes with at least `reports.repeat_fault_threshold` events moving them into `maintenance` within `reports.window_days`.
  - Also: late return count and rate, refunds sum, maintenance downtime hours.
- Phone numbers shown to owners are masked (`+62812****901`).

#### FR-REP-02 Server-Sent Events [P1]
1. `GET /outlets/stream` (public, anonymous): events `availability` `{outletId, category, availableNow}` emitted within 2 s after any commit that can change it (reservation state, bike state, rental state), via Redis pub/sub; heartbeat comment every 25 s.
2. `GET /owner/stream` (owner session): events `rental` and `bike_state`, filtered by `owner_id` server-side. A stream request without a session returns 401.
- **AC:** committing a check-out emits `bike_state` to the owner stream of that owner only.

### 6.8 Notifications

#### FR-NOT-01 Delivery [P1]
1. Templates: `otp`, `reservation_confirmed`, `no_show`, `refund_issued`, `reallocation_offer`, `late_reminder`, `owner_late_flag`, `drift_alert`; P2: `statement_ready`, `payout_paid`, `payout_failed`, `dispute_update`. (The former `verification_result` template was removed with FR-ID-04 in revision 1.2.)
2. Each send inserts a `notifications` row and a BullMQ job. Up to 5 attempts, exponential backoff starting at 30 s. After the fifth failure set `failed` and write `audit_log`.
3. Channel: WhatsApp to renters; email for owner and admin messages. If a WhatsApp send fails permanently and the user has an email, send the same template by email.
4. Notification failure MUST NOT roll back or block the business transaction (enqueue after commit through the outbox).

### 6.9 Ledger and Settlement [P2]

#### FR-LED-01 Posting at rental completion
Consumer of outbox `rental.completed` (idempotent by `rental_id`; unique `(rental_id, type)` guard). In one transaction create entries sharing one `group_id`; amounts are signed from the owner's perspective. Let `P = price_idr`, `D = discount_idr` from the reservation snapshot.
1. `rental_revenue = +P`.
2. `platform_commission = -roundHalfUp(base * rate_bps / 10000)` with `base = P` (`pre_discount`) or `P - D` (`post_discount`), using the `commission_rules` row in force at posting time (owner-specific row before global; latest `effective_from <= now()`).
3. `promo_share = -floor(D * owner_promo_bps / 10000)` (snapshot from reservation; 0 for an opted-out owner), only if `D > 0`.
4. `late_fee_share = +floor(late_fee_idr * late.owner_share_bps / 10000)` only if `late_fee_idr > 0`.
5. `refund_reversal = -refundedAmount` for each succeeded refund linked to the rental (mechanical failure). Platform commission is not reversed.
6. Offline collateral/damage claim resolved by admin: `damage_claim_credit = +floor(amount * claims.owner_share_bps / 10000)`.
7. `week_key` = ISO week of the WIB date of posting time (closed statements never change).
- **AC (T-05):** P 25000, D 0, 1800 bps: revenue +25000, commission -4500, owner net 20500. P 33333 yields commission -6000 (roundHalfUp of 5999.94). P 20000, D 5000, opted-in: promo_share -2500; opted-out: 0. Late fee 10001: owner share +5000. Mechanical failure on P 20000, D 0: entries +20000, -3600, -20000.

#### FR-LED-02 Commission rules
`POST /admin/commission-rules` `{ownerId?, rateBps (integer 0..10000), base, effectiveFrom (V-TS, must be > now())}`. Switching pre to post discount is one new row, with no deployment. Existing ledger rows are never recalculated.

#### FR-LED-03 Weekly statements
Job `build-statements`, cron `5 0 * * 1`, `tz: Asia/Jakarta`, runs for the week that ended Sunday 23:59:59.999 WIB.
1. Per owner: `opening_balance_idr` = previous statement's `carry_idr` (0 if none). Totals per `type` for entries with the week's `week_key`.
2. `net_idr = opening + sum(all entries of the week except payout)`. If `net_idr >= payout.min_idr`: `payout_idr = net_idr`, `carry_idr = 0`; else `payout_idr = 0`, `carry_idr = net_idr` (negative balances also carry).
3. Insert `statements` (unique `(owner_id, week_key)`; re-run is a no-op), render PDF to storage, notify owner (`statement_ready`).
4. `GET /owner/statements/{weekKey}/lines` returns every ledger entry with `rentalId` and outlet for drill-down.
- **AC:** statement totals equal the sum of ledger entries for that owner and week (100% match target); running the job twice creates one statement.

#### FR-LED-04 Tuesday payouts
Job `run-payouts`, cron `0 9 * * 2`, `tz: Asia/Jakarta`.
1. For each statement with `payout_idr > 0` and no `payouts` row: insert `payouts(status = pending)` (unique `(owner_id, week_key)`).
2. Call `gateway.createDisbursement` with idempotency key `payout-<ownerId>-<weekKey>`; set `submitted`.
3. On success callback: `paid`, `paid_at`, insert ledger `payout = -amount`. On failure: `failed`, alert admin; retry only by `POST /admin/payouts/{id}/retry`.
4. Admin fallback `GET /admin/payouts/export?weekKey=` returns a bank-transfer CSV (owner, bank code, account, amount) for manual transfer; marking paid is `POST /admin/payouts/{id}/mark-paid`.
- **AC (T-06):** invoking `run-payouts` twice, or concurrently, produces one payout row and one disbursement call per owner and week.

#### FR-LED-05 Disputes
1. `POST /owner/disputes` `{payoutId (V-UUID), reason (V-TEXT-L)}`. Allowed only if `now() <= payouts.paid_at + 7 days`, else 422 `DISPUTE_WINDOW_CLOSED`. `due_at` = 3 business days (Monday to Friday WIB, excluding `holidays`) after `raised_at`.
2. Admin queue `GET /admin/disputes` (also lists `claim_eligible` items, FR-RNT-04) sorted by `due_at`.
3. Resolve: `PATCH /admin/disputes/{id}` `{decision: upheld|rejected, note (V-TEXT-L), adjustmentIdr? (signed integer, required if upheld)}`. Upheld inserts `manual_adjustment` for the owner.
4. Overdue disputes (now > `due_at`) are highlighted and notified daily to admin.

### 6.10 Security and Audit

#### FR-SEC-01 QR tokens
1. Voucher: `GET /reservations/{id}/voucher` (owning renter session, or the reservation's `guestToken` for a guest booking — A-18; reservation `confirmed`) returns `{token, expiresAt}`. Token is a compact EdDSA-signed JWT with header `kid`, claims `{v:1, rid, nonce, iat, exp = iat + qr.voucher_ttl_seconds}`. The renter app refetches every `ttl/2` seconds.
2. Staff verification: signature with the public key set (bundled in the staff app for offline pre-check; the server re-verifies authoritatively), `exp + 120 s >= occurredAt >= iat - 120 s`.
3. Bike tags encode `asset_tag` plus an HMAC-SHA256 signature with a key id; a physical tag cannot change per scan, so "rotating" means key rotation: tags can be reissued under a new key id and old key ids can be revoked (A-07). The server additionally requires `bike.current_outlet_id` to equal the staff outlet (FR-RNT-01), so a copied tag is useless elsewhere.
4. Signing keys live in environment secrets; never in the repo.

#### FR-SEC-02 Audit
1. `audit_log` receives a row for: every admin mutation, flagged-scan resolution, config change, commission rule change, payout and dispute action, and offline collateral/damage claim decision.
2. Flagged scans: `GET /admin/flagged-scans`, `PATCH /admin/flagged-scans/{id}` `{resolution: dismissed|corrected, note (V-TEXT-L)}`.

---

## 7. API Endpoint Definitions

Base path `/api/v1` (Better Auth endpoints are mounted at `/api/auth/*`). All bodies are JSON and strict. Roles in brackets. "Err" lists error codes beyond the global ones (400 `VALIDATION_ERROR`, 401, 403, 404, 429, 500). Success codes are listed per endpoint.

### 7.1 Public and renter

| Method and path | Role | Request | Success | Err |
|---|---|---|---|---|
| `GET /outlets` | public | query `lat?` V-LAT, `lng?` V-LNG, `category?` V-CAT | 200 list (FR-CAT-01) | n/a |
| `GET /outlets/{id}` | public | path V-UUID | 200 outlet + `availability` | n/a |
| `GET /outlets/{id}/availability` | public | query `category` V-CAT, `startsAt`, `endsAt` V-TS | 200 `{available: int}` | 422 `WINDOW_OUT_OF_RANGE`, `DURATION_OUT_OF_RANGE` |
| `GET /outlets/stream` | public | none | 200 `text/event-stream` | n/a |
| `GET /renters/me` | renter | none | 200 `{phone}` | n/a |
| `POST /pricing/quote` | public | `outletId, category, startsAt, endsAt, promoCode?` | 200 `{priceIdr, discountIdr, finalIdr, dpIdr, units}` | 422 `CATEGORY_NOT_OFFERED`, `PROMO_INVALID`, `AMOUNT_BELOW_MINIMUM`, window and duration codes; 401 `UNAUTHENTICATED` (`promoCode` without a session, P2) |
| `POST /reservations` | public (guest or renter) | header `Idempotency-Key`; `outletId, category, quantity?, startsAt, endsAt, promoCode?, contactPhone?` (`contactPhone` required when unauthenticated, rejected when authenticated) | 201 `{reservation, price, paymentUrl?, guestToken?}` (`paymentUrl` absent when `dpIdr = 0`; `guestToken` present on guest bookings, A-18) | 409 `SOLD_OUT`, `IDEMPOTENCY_IN_PROGRESS`, `DUPLICATE_RESOURCE` (A-19); 401 `UNAUTHENTICATED` (`promoCode` without a session); 422 `OUTSIDE_OPENING_HOURS`, `DURATION_OUT_OF_RANGE`, `WINDOW_OUT_OF_RANGE`, `CATEGORY_NOT_OFFERED`, `PROMO_INVALID`, `AMOUNT_BELOW_MINIMUM`, `IDEMPOTENCY_KEY_REUSED`; 502 `GATEWAY_UNAVAILABLE` |
| `GET /reservations` | renter | query `status?`, `limit`, `cursor` | 200 list (own only; guests have no list — they use `guestToken` links, A-18) | n/a |
| `GET /reservations/{id}` | renter or guest token | path V-UUID; guest access via `Authorization: Bearer <guestToken>` (A-18) | 200 reservation incl. `status`, `quantity`, `expiresAt`, price fields (`priceIdr`, `discountIdr`, `finalIdr`, `dpIdr`), `atRisk` | n/a |
| `GET /reservations/{id}/voucher` | renter or guest token | none; guest access via `Authorization: Bearer <guestToken>` (A-18) | 200 `{token, expiresAt}` | 409 `STATE_CONFLICT` (not `confirmed`) |
| `GET /reservations/{id}/alternatives` | renter | none | 200 list of `{outletId, name, distanceKm?, availableNow}` | 409 `STATE_CONFLICT` (not `at_risk`) |
| `POST /reservations/{id}/reallocate` | renter | header `Idempotency-Key`; `outletId` V-UUID | 200 new reservation | 409 `SOLD_OUT`, `STATE_CONFLICT` |
| `POST /reservations/{id}/decline-reallocation` | renter | none | 200 `{refundId}` | 409 `STATE_CONFLICT` |
| `POST /webhooks/{gateway}` | public | gateway payload (`fake` in P1) | 200 | 401 `WEBHOOK_SIGNATURE_INVALID` |

There is no endpoint to cancel, end, or relocate a rental or a bike (NEG-3, NEG-8). Guest bookings (A-18) are accessed with the reservation-scoped `guestToken` sent in the 201 response and by WhatsApp; a guest token grants only `GET /reservations/{id}` and the voucher endpoint for that one reservation.

### 7.2 Staff (role `staff`, always scoped to the staff user's outlet)

| Method and path | Request | Success | Err |
|---|---|---|---|
| `GET /staff/outlet/bikes` | query `state?`, `category?`, `limit`, `cursor` | 200 list `{bikeId, assetTag, category, state}` | n/a |
| `GET /staff/outlet/expected` | query `date` (`YYYY-MM-DD`, WIB) | 200 reservations starting that day (phone masked) | n/a |
| `GET /staff/outlet/overdue` | none | 200 open rentals past `expected_end_at` with `escalationStage` | n/a |
| `POST /staff/photos/upload-url` | `kind` checklist/damage, `contentType`, `sizeBytes` 1 to 5242880 | 200 `{uploadUrl, key, expiresAt}` | n/a |
| `POST /staff/events` | one event (below) | 200 `{status: "applied"}` | 409 `SCAN_FLAGGED` `{reason}`; 422 `VOUCHER_INVALID`, `VOUCHER_EXPIRED` |
| `POST /staff/events/batch` | `{events: Event[]}`, 1 to 50 items | 200 `{results: [{clientEventId, status, reason?}]}` | n/a |
| `POST /staff/health-sync` | `sentAt`, `physicalCounts?` (FR-INV-05) | 200 `{driftPct?}` | n/a |

**Event** (discriminated by `type`). Common fields: `type`, `clientEventId` V-CLIENT-EVENT-ID, `occurredAt` V-TS (not later than server time + 5 min). Per type:
- `checkout`: `voucherToken` string (compact JWT, max 2048 chars), `bikeAssetTags` V-ASSET-TAG[] (length equal to `reservation.quantity`; the specific bikes the renter takes), `checklist` V-CHECKLIST, `photoKeys` V-PHOTO-KEY[] (length `condition.min_photos` to `max_photos`), `collateral` V-COLLATERAL (collected and logged at the counter), `balanceCollection` `{amountIdr: V-IDR, method: cash|qris}` (the offline 50% balance).
- `checkin`: `bikeAssetTag`.
- `inspection`: `rentalId` V-UUID, `result` pass/damage_found/maintenance_required, `checklist`, `photoKeys` (0 to 8; at least 1 when `damage_found`), `damageDescription?` V-TEXT-L (required when `damage_found`). Damage is settled offline against the logged collateral; no online claim amount is submitted by staff.
- `bike_status_change`: `bikeAssetTag`, `to` available/maintenance/unavailable, `reason` V-TEXT-L. Transition must be in the section 5.1 table, else flagged `ILLEGAL_TRANSITION`; staff may not move `unavailable` to `available` (flag `ROLE_NOT_ALLOWED`).
- `incident`: per FR-RNT-05.

### 7.3 Owner (role `owner`, tenant-scoped through RLS)

| Method and path | Request | Success | Err |
|---|---|---|---|
| `GET /owner/dashboard/summary` | none | 200 (FR-REP-01) | n/a |
| `GET /owner/rentals` | query `status?`, `from?`, `to?` (V-TS), `limit`, `cursor` | 200 list | n/a |
| `GET /owner/bikes` | query `outletId?`, `state?`, `category?`, `limit`, `cursor` | 200 list | n/a |
| `GET /owner/reports/{utilization\|peak-hours\|rental-length\|repeat-faults}` [P2] | query `from`, `to` (`YYYY-MM-DD`, range at most 366 days), `outletId?`, `category?` | 200 | n/a |
| `GET /owner/statements` [P2] | `limit`, `cursor` | 200 list | n/a |
| `GET /owner/statements/{weekKey}` and `/lines` and `/pdf` [P2] | path V-WEEK | 200 (PDF: `application/pdf`) | n/a |
| `PATCH /owner/outlets/{outletId}/categories/{category}` | `safetyBuffer` 0 or 1 | 200 | 409 `STATE_CONFLICT` if `inService - buffer < 0` |
| `PATCH /owner/settings` | `promoOptOut` boolean | 200 (applies to future reservations only, A-08) | n/a |
| `POST /owner/disputes` [P2] | `payoutId`, `reason` | 201 | 422 `DISPUTE_WINDOW_CLOSED` |
| `GET /owner/disputes` [P2] | `limit`, `cursor` | 200 list | n/a |
| `GET /owner/stream` | none | 200 `text/event-stream` | n/a |

### 7.4 Admin (role `admin`; every mutation writes `audit_log`)

| Method and path | Request | Success | Err |
|---|---|---|---|
| `POST /admin/owners`, `PATCH /admin/owners/{id}` | FR-CAT-02 fields; PATCH may set `status` active/suspended | 201 / 200 | 409 `DUPLICATE_RESOURCE` |
| `POST /admin/outlets`, `PATCH /admin/outlets/{id}` | FR-CAT-02 fields; PATCH may set `status`, `hours`, `name`, `description`, `address`, `lat`, `lng` | 201 / 200 | 409 `DUPLICATE_RESOURCE`, `MULTI_OUTLET_DISABLED` |
| `POST /admin/bikes`, `POST /admin/bikes/bulk` | FR-CAT-02 fields | 201 | 409 `DUPLICATE_RESOURCE`; 422 `CATEGORY_NOT_OFFERED` |
| `PATCH /admin/bikes/{id}/state` | `to`, `reason` V-TEXT-L | 200 | 409 `STATE_CONFLICT` |
| `POST /admin/users` | `email`, `password`, `role` staff/owner/admin, `outletId?` (required for staff), `ownerId?` (required for owner) | 201 | 409 `DUPLICATE_RESOURCE` |
| `POST /admin/pricing-rules` | `outletId?`, `category`, `dayType` all/weekday/weekend, `rateIdr` (V-IDR, > 0), `effectiveFrom` V-TS | 201 | n/a |
| `POST /admin/promotions`, `PATCH /admin/promotions/{id}` [P2] | `code` V-PROMO, `kind`, `value` (percent 1 to 100; fixed V-IDR > 0), `maxDiscountIdr?`, `startsAt`, `endsAt` (> `startsAt`), `category?`, `outletId?`, `maxUses?`, `maxUsesPerRenter?` | 201 / 200 | 409 `DUPLICATE_RESOURCE` |
| `POST /admin/commission-rules` [P2] | FR-LED-02 | 201 | n/a |
| `PATCH /admin/config` | `{key, value}`; key must exist in section 4, value type-checked | 200 | n/a |
| `GET /admin/flagged-scans`, `PATCH .../{id}` | paging; `resolution`, `note` | 200 | n/a |
| `POST /admin/settlements/build` [P2] | `weekKey` V-WEEK (must be a completed week) | 202 | 409 `STATE_CONFLICT` |
| `POST /admin/settlements/run-payouts`, `POST /admin/payouts/{id}/retry`, `POST /admin/payouts/{id}/mark-paid`, `GET /admin/payouts/export?weekKey=` [P2] | as FR-LED-04 | 202 / 200 / CSV | 409 `STATE_CONFLICT` |
| `GET /admin/disputes`, `PATCH /admin/disputes/{id}` [P2] | FR-LED-05 | 200 | 409 `STATE_CONFLICT` |
| `GET /admin/audit-log` | `entity?`, `actorId?`, `from?`, `to?`, paging | 200 | n/a |

OpenAPI 3.1 is generated from the Zod schemas in `packages/contracts` and served at `/api/v1/docs` in non-production environments (NFR-11).

---

## 8. Background Jobs

| Job (BullMQ queue) | Schedule | Idempotency mechanism | FR |
|---|---|---|---|
| `release-hold` | delayed to `expires_at` | guarded UPDATE `WHERE status = 'held'` | FR-INV-03 |
| `sweeper` | every minute | guarded UPDATEs; stage only increases | FR-INV-03, FR-RNT-04, FR-INV-04 |
| `outbox-dispatch` | every 5 s | `dispatched_at` set in same transaction as handler effects | all |
| `notification-send` | on enqueue | `notifications.id` | FR-NOT-01 |
| `build-statements` | cron `5 0 * * 1`, tz `Asia/Jakarta` | unique `(owner_id, week_key)` | FR-LED-03 |
| `run-payouts` | cron `0 9 * * 2`, tz `Asia/Jakarta` | unique `(owner_id, week_key)` + gateway idempotency key | FR-LED-04 |
| `dispute-overdue-notify` | daily 09:00 WIB | one notification per dispute per day | FR-LED-05 |

---

## 9. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | **Latency** (seed data, 50 concurrent users, server time excluding external gateway calls): `GET /outlets` p95 < 300 ms and p99 < 600 ms; `GET /outlets/{id}/availability` p95 < 200 ms; `POST /reservations` p95 < 500 ms; `POST /staff/events` p95 < 400 ms; webhook acknowledged < 2 s; SSE event delivered < 2 s after commit; statement PDF < 10 s; `build-statements` for 4 owners < 60 s |
| NFR-02 | **Scale and contention:** design target 20 outlets, 1,000 bikes, 200 concurrent renter sessions, 50 req/s peak reads, 5 reservation transactions/s on one `(outlet, category)` with no error other than `SOLD_OUT`. Reservation transactions run `SET LOCAL lock_timeout = '3s'`; on timeout return 503 `INTERNAL` with `Retry-After: 1` |
| NFR-03 | **Availability and recovery:** 99.5% monthly API uptime; Postgres point-in-time recovery, RPO <= 5 min, RTO <= 60 min |
| NFR-04 | **Security:** TLS 1.2+ with HSTS; CSP and CORS allow-list; cookies `HttpOnly; Secure; SameSite=Lax`; password hashing by Better Auth defaults; parameterized SQL only; secrets in environment, never in the repo; `pnpm audit` fails CI on high severity; webhook verification (FR-PAY-02); rate limits (3.2); RLS (FR-ID-03) |
| NFR-05 | **Time and money:** UTC storage; WIB logic for weeks, hours, business days; integer rupiah only (lint rule banning `parseFloat`, `toFixed` and `number` money fields in `modules/ledger` and `modules/pricing`) |
| NFR-06 | **Privacy:** renter coordinates never persisted (NEG-4); renter phone masked for owners and staff lists; log redaction for phone, `lat`, `lng`, tokens; no digital identity documents are stored anywhere (revision 1.2 — collateral is physical and offline, FR-RNT-01). Obligations under Indonesia's personal data protection law for renter phone numbers and contact data MUST be reviewed by a qualified person before launch (gate G-03) |
| NFR-07 | **UI:** follow shadcn/ui and Tailwind design patterns; renter UI mobile-first, minimum width 360 px; WCAG 2.1 AA contrast; staff app touch targets at least 44 x 44 CSS px; staff PWA installable, precaches its app shell with Workbox, and on a repeat visit loads and accepts scans with the network disabled |
| NFR-08 | **Observability:** one JSON log line per request (`requestId`, route, status, duration); Sentry for unhandled errors; alerts when 5xx rate > 2% over 5 min, `sweeper` has not run for 3 min, or a queue backlog > 100 for 5 min |
| NFR-09 | **Quality gates (CI, blocking):** lint, `tsc --noEmit`, unit and integration tests against a real Postgres container, T-01 concurrency test, line coverage >= 90% on `modules/inventory`, `modules/ledger`, `modules/pricing` |
| NFR-10 | **Migrations and seed:** forward-only SQL migrations; RLS policies, triggers and the partial unique index live in raw SQL migrations; the seed script is idempotent and creates the section 1.1 network |
| NFR-11 | **API documentation:** OpenAPI 3.1 generated from Zod contracts; every route has request, response and error schemas; CI fails if a route lacks a schema |

---

## 10. Test Matrix

Tests derive directly from the requirements above. Integration tests use real Postgres and the `FakeGateway`.

| ID | Covers | Setup, action, expected result |
|---|---|---|
| T-01 | FR-INV-02, INV-2 | Outlet with 5 commuter bikes. Fire 50 parallel `POST /reservations` for the same window. Expect exactly 5 x 201 and 45 x 409 `SOLD_OUT`; no deadlock; availability 0 |
| T-02 | FR-ID-03 | Owners A and B with data. Owner A session calls every owner endpoint and queries as `app_rls`. Expect zero rows or 404 for B's outlets, bikes, rentals, ledger |
| T-03 | FR-INV-03 | Redis stopped. Insert an expired hold and a 61-min-old no-show. Run the sweeper SQL. Expect `expired` and `no_show`; 59-min-old stays `confirmed` |
| T-04 | FR-PAY-02 | Deliver the same paid event twice: one state change. Late payment with capacity 0: one refund row. Wrong amount: no state change |
| T-05 | FR-LED-01 | Table-driven: the FR-LED-01 AC examples, plus rounding boundaries (`x.5`), opted-out owner, post-discount base. Entries of one `group_id` sum to the owner net |
| T-06 | FR-LED-04 | Run `run-payouts` twice and concurrently. One payout row and one disbursement call per owner and week; balance below 100000 carries over |
| T-07 | FR-OFF-01 | Replay one checkout 3 times: one rental. Batch with shuffled `occurredAt`: applied in ascending order. Duplicate returns the first result |
| T-08 | NEG-1, NEG-2, NEG-3 | Introspect `information_schema`: no `bikes` or `bike_events` column named like `lat`, `lng`, `latitude`, `longitude`, `gps`. Enumerate registered routes: none match bike-location or rental-end patterns for the renter role |
| T-09 | FR-INV-01 | Table-driven availability cases from the FR-INV-01 AC, including overdue rental and buffer |
| T-10 | FR-PRC-01, FR-RNT-02 | Table-driven pricing and late-fee cases from the ACs (61 min gives 2 units; 12:15 / 12:16 / 13:01 late fees) |
| T-11 | section 5.1 | Every pair not in the transition table throws `STATE_CONFLICT`; every allowed transition writes exactly one `bike_events` row |
| T-12 | INV-6 | UPDATE and DELETE on each append-only table raise an exception |
| T-13 | End to end (Playwright) | A guest renter (unauthenticated, `contactPhone`) books a reservation with `quantity = 2`; FakeGateway DP paid event confirms it; the guest fetches the voucher with `guestToken` (A-18); staff scans voucher, checks out 2 bikes with `bikeAssetTags` (length 2), logs `collateral`, and records the offline `balanceCollection`; staff check-in; inspection `pass`. Expect 2 `rentals` `completed` (sharing the reservation), bikes `available`, availability restored |
| T-14 | Section 3.4, section 7 | Table-driven from the Zod schemas: each endpoint rejects unknown fields, each V-rule rejects its boundary value (n-1, n+1) with 400 and `details[].path` |
| T-15 | FR-INV-04 | The FR-INV-04 AC; accepting an alternative creates a `confirmed` reservation with copied price and no payment intent; declining creates one full refund |
| T-16 | FR-RNT-01, 02, 03, 05 | Flag reasons: each condition produces the listed `reason` (`QUANTITY_MISMATCH`, `COLLATERAL_REQUIRED`, `BALANCE_MISMATCH`, `RESERVATION_NOT_CONFIRMED`, plus the inspection/incident reasons) and leaves bike and rental state unchanged |

---

## 11. Assumptions, Gaps and Gates

### 11.1 Gates (stop and report; do not work around)

- **G-01 Xendit sandbox check** before the payments PR merges: confirm that Invoice supports cards, OVO and GoPay (and QRIS), that a refund API is available, and that the Disbursement API is enabled. If any item fails, stop and report. Do not substitute another gateway silently. Phase 1 fallback for payouts is the CSV export in FR-LED-04.
- **G-02 Better Auth check:** confirm the installed version provides phone-number OTP and email-password with additional user fields. Report if not.
- **G-03 Legal review** of personal-data handling (renter phone numbers and contact data; there are no ID images since revision 1.2) before production launch (NFR-06).

### 11.2 Assumptions made to remove ambiguity (reversible, tagged in the text)

| ID | Assumption | Why |
|---|---|---|
| A-01 | WhatsApp and email only; no push | PRD says push and WhatsApp; tech document says WhatsApp and email; apps are PWAs |
| A-02 | Fixed six-item condition checklist; 1 to 8 photos per scan | PRD says "short checklist with photos" without items |
| A-03 | On no-show, `noshow.refund_policy` decides refund; fixture is full refund | PRD says no forfeit until down-payment is decided but is silent on the paid amount |
| A-04 | Added ledger types `damage_claim_credit`, `manual_adjustment`, and tables `payment_intents`, `commission_rules`, `outbox_events`, `scan_events` | Needed by PRD features; absent from the tech document's core table list. The `deposits` and `deposit_claims` tables were removed in revision 1.1 |
| A-05 | Bike states `held`, `reserved` unused in code | Reservations are category-level; a bike is bound only at check-out |
| A-06 | Reallocation keeps the original price and paid amount; the target outlet may belong to another owner | PRD says "offers an alternative bike or outlet" without pricing |
| A-07 | Bike tag "rotation" is key rotation, not per-scan change | A printed tag cannot change per scan |
| A-08 | Promo opt-out means the promotion still applies and the owner's share is 0 (platform bears the whole discount); opt-out is snapshotted per reservation | Literal reading of the tech document; the alternative reading (no promos at that owner's outlets) is a one-line change in FR-PRC-01 |
| A-09 | Late fee is waived on mechanical failure; collection follows `late.collection_method` (`payment_intent` invoice or `offline_cash` recorded at the counter) | PRD defines the split, not the collection. Revision 1.1 removed deposit deduction |
| A-10 | Renters sign in by phone OTP when they choose to create an account; guests book with `contactPhone` only (revision 1.2). Staff, owner and admin sign in by email and password, admin-created | PRD and tech document name roles but not credentials |
| A-11 | Capacity counts bikes by `home_outlet_id`; creating a second outlet per owner is blocked until `feature.sister_outlets_enabled`. P3 MUST revisit the capacity basis before enabling it | Tech document specifies home outlet; sister returns change `current_outlet_id` |
| A-12 | A reservation is secured by a 50% online down payment (`booking.dp_rate_bps`); the balance and any extra charge are collected offline at the counter. There is no standing deposit balance | Revision 1.1 pivot to local practice: the PRD's "security deposit" is realized as a down payment plus physical collateral |
| A-13 | Damage discovered at check-in is assessed by staff and settled offline against the collateral logged at check-out (FR-RNT-01, FR-RNT-03); an optional admin `manual_adjustment`/`damage_claim_credit` (P2) reconciles the ledger | PRD says "can be claimed against the deposit" without an online claim flow; revision 1.1 has no `deposit_claims` |
| A-14 | Rental is `returned` at check-in and `completed` at inspection; ledger posts at `completed` | PRD says revenue posts "at rental completion" |
| A-15 | Drift check compares server custody counts with staff-reported `physicalCounts` | PRD names the check but not its inputs |
| A-16 | P1 dashboard earnings shows gross only; commission appears with the P2 ledger | Ledger is P2 in the tech document |
| A-17 | A guest is a `renters` row keyed by phone with `user_id = NULL`; a later OTP verify from the same phone links the row instead of creating a duplicate, so guest bookings carry into the account | Revision 1.2 guest checkout needs a durable identity before any sign-up |
| A-18 | A guest accesses one reservation through a reservation-scoped signed `guestToken` returned in the 201 response and delivered by WhatsApp; it grants `GET /reservations/{id}` and the voucher endpoint only. Guests have no list endpoint | A guest without a session still must fetch the QR voucher to check out |
| A-19 | A phone may hold at most `booking.max_active_reservations_per_phone` (seed 3) reservations in status `held` or `confirmed`; excess returns 409 `DUPLICATE_RESOURCE`. Backstop only — the 50% DP is the primary anti-spam control | Revision 1.2 removes ID verification, so a cheap guard against hold-farming is needed |

### 11.3 Source discrepancies found

- The tech document said two PRD items were on hold (down-payment, ID verification); the PRD also listed a deposit amount and release. Revision 1.1 resolves the down-payment by specifying a 50% DP (section 4) and removes the digital deposit entirely. Revision 1.2 removes ID verification entirely (FR-ID-04 deleted): the 50% DP plus offline physical collateral secure good faith.
- The PRD lists payment by cards, GoPay and OVO; the tech document adds QRIS. This SRS requires all four to be confirmed in G-01.

### 11.4 Not specified in the PRD, deliberately excluded

Renter-initiated cancellation or refund on request, multi-owner carts, loyalty or referral features, subscriptions, per-bike GPS, in-app chat, any digital security deposit, and any digital ID verification or ID document storage (removed in revision 1.2; collateral is physical and offline). The 50% down payment (FR-INV-02) and no-show forfeit per `noshow.refund_policy` are in scope as of revision 1.1. Add a requirement here before building any of them.

### 11.5 Decisions still owed by the business (implemented as config, section 4)

Rental rates and billing unit (including weekday/weekend tiers), booking window limits, late-fee rate and grace, escalation timings, down-payment rate (`booking.dp_rate_bps`, seed 50%), lost-unit penalty, maximum active reservations per phone (`booking.max_active_reservations_per_phone`, seed 3), QR token lifetime. The seed values in section 4 are illustrative mock data: owners and admin may change every amount.

---

## 12. Implementation Order (one PR per step; each PR passes NFR-09 gates)

**Phase 1**
1. `packages/db`: schema, enums, RLS, triggers, partial unique index, seed (section 1.1). Tests T-02, T-08, T-11, T-12.
2. Identity (FR-ID-01 to FR-ID-03, guest checkout identity A-17), config store, audit log (FR-SEC-02), error envelope, idempotency middleware (guest keying).
3. Inventory core: FR-INV-01, FR-INV-02 (guest checkout, `contactPhone`, `guestToken`), FR-PRC-01 (without promos), FR-PAY-02, FR-PAY-03 with `FakeGateway`. Tests T-01, T-04, T-09, T-10. Then Xendit adapter after gate G-01.
4. FR-INV-03 jobs and sweeper. Test T-03.
5. Staff PWA and rental lifecycle: FR-OFF-01, FR-RNT-01 to FR-RNT-05, FR-INV-04, FR-INV-05, FR-SEC-01. Tests T-07, T-15, T-16.
6. Catalog and renter site: FR-CAT-01, FR-CAT-02, FR-REP-02, FR-NOT-01. Test T-13.
7. Basic owner dashboard (FR-REP-01 P1) and admin console pages.

**Phase 2**
8. Ledger, commission rules, promotions (FR-LED-01, FR-LED-02, FR-PRC-01 promos). Test T-05.
9. Statements, payouts, disputes (FR-LED-03 to FR-LED-05). Test T-06.
10. Reports (FR-REP-01 P2).

**Phase 3**
11. Enable `feature.sister_outlets_enabled` after revisiting A-11; e-bike category data and attributes; optional Capacitor wrapper.

---

## Appendix A. PRD Traceability

| PRD section | Requirements |
|---|---|
| 1 Principles (3 rules) | INV-1 to INV-4, NEG-1 to NEG-3, FR-INV-02 |
| 2 Network baseline | Section 1.1, FR-CAT-02, seed (NFR-10) |
| 3 Users | Sections 1.2, 1.3 |
| 4.1 Discovery | FR-CAT-01, FR-REP-02 |
| 4.2 Reservation, payment, 15 min, 1 h | FR-INV-02, FR-INV-03, FR-PAY-02 |
| 4.2b Multi-bike reservation and 50% down payment | FR-INV-01, FR-INV-02, FR-PRC-01, section 4 |
| 4.3 Check-out | FR-RNT-01, FR-SEC-01 |
| 4.4 Check-in | FR-RNT-02, FR-RNT-03 |
| 4.5 Late, damage, failure | FR-RNT-02, FR-RNT-03, FR-RNT-04, FR-RNT-05, FR-PAY-03 |
| 4.6 Tenant dashboard | FR-REP-01, FR-REP-02, FR-ID-03 |
| 4.7 Admin console | FR-CAT-02, section 7.4, FR-SEC-02 |
| 5 Lock and states | Section 5.1, FR-INV-01 to FR-INV-05 |
| 6 Architecture and security | Sections 2, 5, 9, FR-OFF-01, FR-SEC-01 |
| 7 Settlement | FR-LED-01 to FR-LED-05 |
| 8 Owner asset security | FR-RNT-01 to FR-RNT-04, INV-3, INV-4 |
| 9 Roadmap and targets | Sections 1.6, 12; drift (FR-INV-05); statement match (FR-LED-03); overbooking (T-01, FR-INV-04) |
| 10 Decisions and open items | Sections 4, 11 |
