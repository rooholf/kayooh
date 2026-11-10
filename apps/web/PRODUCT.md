# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Scope of this record

This record describes the product **as consumed through `apps/web`** — synced to SRS revision 1.3 (9 Nov 2026): the white-labeled direct outlet booking page plus the owner dashboard and admin console that ship in the same app. Outlet staff use a separate offline scanner PWA (`apps/staff`); its surfaces are not covered here.

## Users

**Renter (primary consumer).** Someone in Jambi who taps a bike-rental owner's bio link and lands on that owner's own booking page. They pick a bike category, a time window and a quantity, pay the 50% down payment, collect the bike at the staffed counter by QR scan, and return it to a staffed outlet of the same owner. Their job is finished the moment they are riding; auth is optional (guest checkout keyed by phone). An account exists mainly to claim promotions — a `promoCode` is only accepted on an authenticated session.

**Owner (the platform's customer, B2B2C).** An individual bike-rental operator who personally owns their fleet. They drop the direct booking link `https://<host>/<outletCode>` into their social-media bio; their renters arrive through that link, never through a platform map. Between bookings they live in the dashboard: fleet health, bike status by outlet and category, live rentals, late returns, gross earnings accrual. Read-mostly: the daily job is oversight, not operation.

**Platform admin.** Onboards owners, outlets, bikes and staff accounts; sets pricing and promotions; runs weekly settlements; handles disputes and damage claims.

## Product Purpose

A white-labeled, headless booking engine for individual bike-rental owners (SRS rev 1.3). Renter entry is outlet-specific — one owner, one outlet page per link; there is no global outlet map as the primary surface and no platform-wide outlet browser in the renter flow. Availability, pricing, reservation and voucher flows are all scoped to that single outlet. Owners receive fleet visibility and (P2) automated weekly financial statements.

Success is defined numerically: zero overbooking incidents, zero unaccounted bikes at weekly close, inventory drift under 1% on the 5-minute check, and payout statements matching the ledger at 100%.

## Positioning

The owner's storefront, guaranteed by the booking-to-inventory lock.

The stock a renter sees on the owner's booking page equals the physical stock that owner holds. Availability is decided only by the server inside one database transaction holding a row lock — never by the client, a cache, or the 5-minute outlet sync. There is no dockless rental, no live bike map and no GPS-tracker experience: a rental ends only through a staff scan-in at a registered storefront.

A dockless competitor can copy the map the app has deliberately abandoned, the payment flow, and the link in a bio, but it cannot truthfully promise that on this owner's page a bike is physically waiting at a named address with a custody trail behind it. That promise is the product.

## Operating Context

- Jambi, Indonesia. Business hours, weeks and business days are computed in `Asia/Jakarta` (WIB, UTC+7); storage is UTC. Dates and money follow Indonesian conventions (IDR, WIB, `dd/mm`).
- Entry is one link: the renter opens a direct, outlet-specific URL keyed by the outlet code (e.g. `/TELANAIPURA`), resolved by `GET /outlets/by-code/{code}`. The global `GET /outlets` catalog is retained but deprioritized.
- The launch network is 4 owners, 4 staffed outlets and 150 bikes across four categories: Commuter, Road, MTB, Fixie. Each owner runs exactly one outlet today.
- Two handovers bracket every rental, both at a staffed counter: staff scan the renter QR and the bike asset tags at check-out (logging physical collateral — KTP, SIM or vehicle — per bike), and scan the bike and inspect it at check-in. The scanner may be offline, so custody events queue on the device with a client-generated UUID and sync later.
- Money flow: the renter pays a 50% online down payment (config `booking.dp_rate_bps`, default 5000); staff collect the balance offline (cash/QRIS) at check-out. A reservation is confirmed only after the DP is paid.
- Payments run behind the `PaymentGateway` seam; P1 ships the `FakeGateway` only, with Xendit (cards, GoPay, OVO) as the P1+ target. Notifications: WhatsApp to renters, email for owner and admin messages.
- Money cycle for owners: cut-off Monday 00:00 to Sunday 23:59 WIB; (P2) statements built Monday, payouts Tuesday by bank transfer with an IDR 100,000 minimum (below which the balance rolls over).

## Capabilities and Constraints

**Confirmed capabilities (launch scope, SRS 1.3).** Guest checkout with optional phone-OTP sign-in (guest renters keyed by `contactPhone`); incentivized accounts (promotions require sign-in); the white-labeled direct outlet page by outlet code; the reservation lock for a `quantity` of one category (a lock succeeds only when `available >= quantity`, else 409 `SOLD_OUT`); hold expiry and no-show release jobs; DP payment plus signed QR vouchers; staff check-out (asset tags + collateral), check-in and inspection; the offline staff queue; notifications; and the basic owner dashboard (FR-REP-01 P1): `GET /owner/dashboard/summary` — per outlet and category bike counts by state, held/confirmed counts (sum of reservation `quantity` overlapping now), open rentals (asset tag, masked phone, checked-out time, expected end, overdue, escalation stage), late returns, and `grossAccruedIdr` for the current WIB week (completed rentals, before commission, labeled gross) — plus `GET /owner/stream` SSE (rental and bike_state events, owner-filtered).

**Removed by revision (must not return).** Mandatory digital ID verification (rev 1.2) and any digital security deposit (rev 1.1) are deleted. Collateral is physical and offline, logged at check-out. Any DP refund on no-show or reallocation is applied server-side per config — never on renter request.

**Constraints that future work must respect.**

- NEG-1/2/3: no dockless logic, no bike GPS. Only outlets carry coordinates; renter coordinates sent for sorting are never persisted or logged. Renter-facing surfaces show counts, never bike ids or asset tags (owners do see asset tags in their own open-rentals list).
- NEG-7: no push notifications; channels are WhatsApp and email (the dashboard's live updates are in-app SSE).
- NEG-8: no renter cancellation endpoint and no renter-initiated refunds.
- A renter-facing endpoint never ends a rental, changes a bike state, or confirms custody.
- No inter-owner transfer or settlement. Revenue accrues to the owner of the bike's home outlet.
- Money is integer rupiah (`bigint`). No floats or decimals anywhere in the database, API or code.
- One deployable API. Modules interact only through exported functions, never by importing another module's tables.
- Row-level security isolates every owner-facing query; a resource outside the caller's scope returns 404, not 403.
- `bikes.state` is never set to `held` or `reserved` (A-05); the dashboard derives held/reserved pressure from `reservations.quantity`.

**Undecided — record, never invent.** Business decisions still owed, exposed as configuration with FIXTURE seed values only:

- **Pricing** — per-category rates, billing unit, booking slot length, duration limits, advance-booking window, no-show refund policy defaults, late-fee schedule (fixture: Rp 20,000 per started 30 min), lost-unit fee (fixture: Rp 4,000,000), repeat-fault thresholds. Owners may override their own pricing (rev 1.1 §5).
- **Late escalation minutes** — `reminder 0 / staff_call 30 / owner_flag 60 / claim_eligible 240` are current config defaults, subject to decision.

## Brand Commitments

- **Name: Kayooh** — a wordplay on the Indonesian *kayuh*, "to pedal".
- No logo exists; the name is the only binding brand asset. The renter route group carries its chosen visual world ("Poster Solidaritas"), recorded in `apps/web/DESIGN.md`; the `(owner)` and `(admin)` groups have their own worlds still to be decided — the flat poster look in one group does not bind the others.
- User-facing copy is **Bahasa Indonesia**. Code identifiers, comments and documentation stay English.

## Evidence on Hand

- **Real:** SRS revision 1.3, PRD v1.2 and the tech document; the network baseline; the implemented owner summary API (`apps/api/src/modules/owner/summary.ts`, routed in `modules/owner/routes.ts` with phone masking and WIB week bounds computed server-side); the renter direct-entry page (`apps/web/src/app/(renter)/[outletCode]`).
- **Placeholder:** outlet latitude/longitude and opening hours are seed fixtures, explicitly marked FIXTURE; bike asset tags follow `JMB-<outlet 3 digits>-<COM|ROD|MTB|FIX>-<nnn>`; all pricing figures in seed data are fixtures, not decisions; dashboard mock figures (Rp 18.240.000, "9 transaksi", per-day rhythm bands) are mock fixtures.
- **Absent:** no customer testimonials, press coverage, photography, pricing page, or third-party case studies exist. Future work must not fabricate any of them.

## Product Principles

1. **The server is the only source of availability.** No client value, cache, or sync job may grant a reservation.
2. **A bike is only ever at a place.** Every state change is tied to an outlet and writes exactly one custody event.
3. **The entry is one owner's outlet.** Each renter surface is scoped to a single owner's outlet code; there is no loose-bike browsing and no platform map as the primary flow.
4. **Money is integer rupiah, and every movement is append-only.** Gross is labeled gross until settlement (P2).
5. **Renter autonomy stops at custody.** Only a staff scan moves a bike.

## Accessibility & Inclusion

- Renter surfaces are mobile-first with a minimum viewport width of 360 px.
- WCAG 2.1 AA contrast is required.
- Touch targets on the staff scanner are at least 44 x 44 CSS px.
- Interface language is Bahasa Indonesia; text and numbers assume Indonesian conventions (IDR, WIB, `dd/mm` dates).
