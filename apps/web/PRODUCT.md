# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Scope of this record

This record describes the product **as consumed through `apps/web`**: the renter experience plus the owner dashboard and admin console that ship in the same app. Outlet staff use a separate offline scanner PWA (`apps/staff`); its surfaces are not covered here.

## Users

**Renter (primary).** Someone in Jambi who wants a bicycle for a few hours. On a phone they find a nearby outlet that has the bike type they want, pay, collect the bike at the counter by QR scan, and return it to a staffed outlet. Their job is finished the moment they are riding; everything else in the app is friction to be removed.

**Owner.** Runs one or more outlets and personally owns the bicycles. Follows fleet health, bike status by outlet, utilization per category, live rentals, late returns, refunds and earnings accrual. Read-mostly: the daily job is oversight, not operation.

**Platform admin.** Onboards owners, outlets, bikes and staff accounts; sets pricing and promotions; runs weekly settlements; handles disputes, ID-verification reviews and damage claims.

## Product Purpose

A station-based, multi-owner bike rental network. Renters browse outlets, reserve a bike category for a time window, pay through the gateway, collect the bike from a staffed storefront via QR scan, and return it to a staffed storefront of the same owner. Owners keep full ownership of their fleet and receive fleet visibility and automated weekly financial statements.

Success is defined numerically: zero overbooking incidents, zero unaccounted bikes at weekly close, inventory drift under 1% on the 5-minute check, and payout statements matching the ledger at 100%.

## Positioning

Station-to-station, guaranteed, through the booking-to-inventory lock.

The stock a renter sees equals the physical stock an owner holds. Availability is decided only by the server inside one database transaction holding a row lock — never by the client, a cache, or the 5-minute outlet sync. There is no dockless rental, no live bike map and no GPS-tracker experience: a rental ends only through a staff scan-in at a registered storefront.

A dockless competitor can copy the map, the app and the payment flow, but it cannot truthfully promise that a bike is physically waiting at a named address with a custody trail behind it. That promise is the product.

## Operating Context

- Jambi, Indonesia. Business hours, weeks and business days are computed in `Asia/Jakarta` (WIB, UTC+7); storage is UTC.
- The launch network is 4 owners, 4 staffed outlets and 150 bikes across four categories: Commuter, Road, MTB, Fixie. Each owner runs exactly one outlet today, so same-owner returns are same-outlet returns in practice.
- Discovery is outlet-based. Renters browse a list and map of outlets with live availability per category; they never browse individual bikes.
- Two handovers bracket every rental, both at a staffed counter: staff scan the renter QR and the bike asset tag at check-out, and scan the bike and inspect it at check-in. The scanner may be offline, so custody events queue on the device with a client-generated UUID and sync later.
- Payments run through Xendit (cards, GoPay, OVO); notifications run by WhatsApp and email.
- Money cycle for owners: cut-off Monday 00:00 to Sunday 23:59 WIB, statements built Monday, payouts Tuesday by bank transfer with an IDR 100,000 minimum (below which the balance rolls over).

## Capabilities and Constraints

**Confirmed capabilities (launch scope).** Renter phone-OTP sign-in; renter ID verification behind a provider seam with a manual-review implementation; security deposit; outlet catalog with live per-category availability; the reservation lock; hold expiry and no-show release jobs; Xendit payment collection plus signed QR vouchers; staff check-out, check-in and inspection; the offline staff queue; notifications; and a basic owner dashboard (live rentals, bike status counts, gross earnings accrual).

**Constraints that future work must respect.**

- No dockless logic and no bike GPS. Only outlets carry coordinates; renter coordinates sent for sorting are never persisted or logged.
- No renter-facing endpoint ends a rental, changes a bike state, or confirms custody.
- No inter-owner transfer or settlement. Revenue accrues to the owner of the bike's home outlet.
- Money is integer rupiah (`bigint`). No floats or decimals anywhere in the database, API or code.
- No push notifications in launch scope; channels are WhatsApp and email only.
- No renter cancellation endpoint.
- One deployable API. Modules interact only through exported functions, never by importing another module's tables.
- Row-level security isolates every owner-facing query; a resource outside the caller's scope returns 404, not 403.

**Undecided — record, never invent.** These are business decisions still owed, exposed as configuration:

- **Down-payment** — whether to adopt it, its size, when the balance is paid, and the no-show penalty are on hold. Until decided, bookings carry no down-payment and no no-show forfeit.
- **ID verification method and provider** — on hold. The requirement that verification happens is firm.
- **Deposit amount**, and when it is released or claimed — undecided.
- **Pricing** — rate per category, billing unit, booking slot length, duration limits, advance-booking window, late-fee rules, safety buffer, and the sister-outlet feature flag are all undecided. The numbers currently in the seed data are fixtures, not decisions.

## Brand Commitments

- **Name: Kayooh** — a wordplay on the Indonesian *kayuh*, "to pedal".
- No logo, palette, typeface, or voice guide exists yet. The name is the only binding brand asset; nothing visual is inherited.
- User-facing copy is **Bahasa Indonesia**. Code identifiers, comments and documentation stay English.

## Evidence on Hand

- **Real:** the network baseline (4 outlets, 4 owners, 150 bikes by category) and the business rules captured in the PRD and SRS.
- **Placeholder:** outlet latitude/longitude and opening hours are seed fixtures, explicitly marked FIXTURE and to be replaced with real data before launch. Bike asset tags follow `JMB-<outlet 3 digits>-<COM|ROD|MTB|FIX>-<nnn>`.
- **Absent:** no customer testimonials, press coverage, photography, pricing page, or third-party case studies exist. Future work must not fabricate any of them.

## Product Principles

1. **The server is the only source of availability.** No client value, cache, or sync job may grant a reservation.
2. **A bike is only ever at a place.** Every state change is tied to an outlet and writes exactly one custody event.
3. **Discovery is about outlets, never loose bikes.**
4. **Money is integer rupiah, and every movement is append-only.**
5. **Renter autonomy stops at custody.** Only a staff scan moves a bike.

## Accessibility & Inclusion

- Renter surfaces are mobile-first with a minimum viewport width of 360 px.
- WCAG 2.1 AA contrast is required.
- Touch targets on the staff scanner are at least 44 x 44 CSS px.
- Interface language is Bahasa Indonesia; text and numbers should assume Indonesian conventions (IDR, WIB, `dd/mm` dates).
