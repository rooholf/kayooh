# Jambi Bike Rental Network: PRD and System Architecture

Version 1.2 | 6 November 2026 | For fleet owners and the platform team

**Revision 1.2 (conversion-rate optimization: guest checkout).** Four changes: (1) mandatory digital ID verification is removed entirely — no ID upload, review queue or verification status exists, and no identity document is ever stored by the platform; (2) renter sign-in is optional — a renter can book as a **guest** by supplying a contact phone number, and the **50% down payment (DP)** is the primary anti-spam and no-show control; (3) renter accounts now exist primarily to claim platform and owner promotions and vouchers; (4) staff still collect **physical collateral** (KTP, SIM or vehicle) offline at check-out — nothing about that flow changes.

**Revision 1.1 (architecture pivot to local Jambi practice).** Six changes: (1) multi-bike reservations via a `quantity` on each reservation; (2) the digital security deposit is removed entirely — there are no deposit balances, no `deposits`/`deposit_claims` tables and no deposit endpoints; (3) a **50% down payment (DP)** paid online confirms a reservation, and the remaining 50% is collected **offline** (cash/QRIS) by staff at check-out; (4) staff collect **physical collateral** (KTP, SIM or vehicle) at check-out and the event records the specific bikes handed over; (5) local penalty and pricing structures are **configurable seed data**, not policy — owners may change every amount; (6) Phase 1 uses a mock payment gateway (`FakeGateway`) exclusively.

## 1. Purpose and Principles

This platform is a station-based, multi-owner rental aggregator for Jambi. Renters browse outlets, reserve a bike, collect it at a staffed storefront, and return it to a verified storefront. Owners keep full ownership of their bicycles and receive automated fleet and financial reporting.

Three rules govern every design decision:

1. **Station-to-station only.** Every bike belongs to a registered outlet and is always in a recorded custody state tied to a physical location.
2. **Booking-to-inventory lock.** The digital stock a renter sees must equal the physical stock an owner holds. Overbooking is a defect, not an edge case.
3. **No dockless rentals.** There is no drop-anywhere return, no live bike map and no GPS-tracker experience. Location in the app means outlets, never loose bikes.

**Agreed decisions:** bikes may be returned to any outlet of the same owner; e-bikes are a future-ready category in the data model; the inventory lock is hybrid (the app holds the reservation lock, a staff scan confirms physical custody).

## 2. Network Baseline

| Outlet | Owner | Commuter | Road | MTB | Fixie | Total |
| --- | --- | --- | --- | --- | --- | --- |
| JMB-001 Telanaipura Hub | CV Jambi Sepeda Maju | 20 | 10 | 10 | 5 | 45 |
| JMB-002 Danau Sipin Recreation | Sipin Lakeside Rentals | 15 | 0 | 10 | 5 | 30 |
| JMB-003 Kotabaru | Kotabaru Active | 10 | 20 | 5 | 15 | 50 |
| JMB-004 Pasar Jambi | Laju Express Rentals | 20 | 0 | 5 | 0 | 25 |
| **Network** | 4 owners | 65 | 30 | 30 | 25 | **150** |

Each owner currently runs exactly one outlet, so same-owner returns are effectively same-outlet today. The sister-outlet logic is built now so an owner who opens a second storefront needs only configuration, not new development.

## 3. Users

- **Renter:** finds an outlet with the right bike type, pays, collects, returns. An account is optional: a guest books with a contact phone number only, and an account exists primarily to claim platform and owner promotions and vouchers.
- **Outlet staff:** hands over and receives bikes using a scanner app.
- **Owner:** monitors fleet health, utilization and earnings in a Tenant Dashboard.
- **Platform admin:** onboards owners, manages promotions, handles disputes and payouts.

## 4. Feature Specification

### 4.1 Outlet-based discovery

Renters browse a list and map of outlets only. Each outlet card shows live availability by category (Commuter, Road, MTB, Fixie), opening hours, address and distance from the renter. The renter location is used only to sort outlets and is never tied to a bike. Outlet profiles reflect their character: Danau Sipin shows no road bikes, and Pasar Jambi highlights cargo-rack commuters.

### 4.2 Reservation

No account or ID verification is required to book (revision 1.2): a renter books as a guest by supplying a contact phone number; there is no digital security deposit and no digital ID check. The renter picks an outlet, category, a **quantity** of bikes and a time window. The reservation locks that many bikes under the category and is priced from the owner's rate card (a weekday/weekend tier may apply). The renter confirms by paying a **50% down payment (DP)** through the payment gateway — the DP is the primary anti-spam and no-show control; the DP moves the reservation from held to confirmed and produces a signed QR voucher, delivered to the contact phone by WhatsApp (guests receive a signed guest link to their booking and voucher). In Phase 1 the gateway is a mock (`FakeGateway`); a real gateway is wired in after a sandbox check. The remaining 50% balance is collected **offline** by staff at check-out (cash or QRIS). Unpaid checkout holds lapse after a 15-minute payment window so stock is not blocked. A confirmed reservation is held for 1 hour after its scheduled start time. If the renter has not collected the bikes by then, the reservation is marked no-show, the DP is refunded or retained per the configured refund policy, and the bikes are released.

### 4.3 Check-out (handover)

Staff scan the renter QR and then the asset tag of **each bike** in the reservation (the count must match the reservation quantity), complete a short condition checklist with photos, collect and log **physical collateral** (KTP, SIM or vehicle), and record the **offline balance payment** (cash or QRIS). This scan is the only action that moves a bike into a rental.

### 4.4 Check-in (return)

The renter returns the bike to the booking outlet or another outlet of the same owner. Staff scan the bike, inspect it and confirm. A rental cannot be ended from the renter phone. Until a staff scan happens, the rental stays open and late fees accrue.

### 4.5 Late, damage and failure handling

Overdue rentals follow an escalation path: reminder, staff call, owner flag, claim. Damage found at check-in is logged against the photos from check-out and is settled **offline against the physical collateral** collected at check-out; if a unit is lost, the configured lost-unit penalty is recorded and recovered against that collateral. Mechanical failures during a rental trigger a refund of the online down payment to the renter (the offline balance is returned in cash) and move the bike to Maintenance.

### 4.6 Tenant Dashboard (owners)

Real-time rentals, bike status by outlet, utilization per category, earnings accruals, late returns, refunds, maintenance downtime and downloadable weekly statements. Owners see only their own tenant data.

### 4.7 Admin console

Owner and outlet onboarding, bike registration, pricing and promotion rules, settlement runs, dispute queue and audit log.

## 5. Booking-to-Inventory Lock

**Bike states:** Available, Held (payment pending, expiring), Reserved (paid), In Rental (staff scan-out), Pending Inspection (staff scan-in), Maintenance, Unavailable. A Charging state exists in the model for future e-bikes.

**Lock rules**

- Availability per outlet, category and time window is computed on the aggregator server as in-service bikes minus the bikes committed by active reservations (each reservation commits its `quantity`) and minus in-rental bikes for overlapping windows. Reservation writes run in a single database transaction with row-level locking, so two renters cannot claim the last bike.
- Only a staff scan changes physical custody. The app never infers custody from a phone.
- The 5-minute outlet health sync carries maintenance and condition updates and runs a drift check. It is never the lock itself, so a sync delay cannot cause overbooking.
- If staff report a bike missing or damaged, the system blocks it at once, recalculates availability and offers affected renters an alternative bike or outlet.
- Small categories can carry an optional one-bike safety buffer, configured by the owner. Confirmed reservations not collected within 1 hour of the scheduled start are released automatically; the down-payment refund or forfeit follows the configured refund policy.

Every bike therefore has a continuous custody trail: which outlet, which staff member, which renter, and when.

## 6. System Architecture

**Clients:** renter mobile app, staff scanner app (works offline, queues scans with timestamps and syncs when connectivity returns), owner web dashboard, admin console.

**Services**

- Identity and tenancy (roles, owner isolation, optional renter auth and guest checkout)
- Outlet and catalog (outlets, sister groups, bike categories)
- Inventory and reservation (the lock, multi-bike `quantity`, down-payment confirmation)
- Rental lifecycle (check-out, check-in, late and damage rules, physical collateral)
- Pricing and promotions
- Payments (gateway integration, refunds; mock `FakeGateway` in Phase 1)
- Ledger and settlement
- Notifications (push and WhatsApp)
- Reporting

**Data and infrastructure:** PostgreSQL as the system of record with a tenant ID on every row and row-level security; Redis for hold expiry timers; an event bus so rental events feed the ledger and reports; object storage for condition photos; an append-only audit log.

**Core entities:** Owner, Outlet, SisterGroup (owner-scoped), Bike (asset tag, category, home outlet, current outlet, state), Renter (phone-keyed, optional account), Reservation (quantity, down-payment amount, status), Rental (with logged physical collateral and offline balance), LedgerEntry, Payout.

**Security:** rotating signed QR tokens, guest checkout secured by a 50% down payment as the primary anti-spam control, physical collateral logged offline by staff at check-out, immutable custody records, and server-side authority over all stock decisions even when staff devices are offline. No digital identity documents are collected or stored by the platform.

**Scalability:** a new outlet or owner is data onboarding. New categories such as e-bikes are added through category attributes (battery, charge state) without schema redesign.

## 7. Financial Reporting and Settlement

The ledger applies the agreed revenue model automatically at rental completion.

| Rule | Treatment |
| --- | --- |
| Standard split | 82% owner, 18% platform, calculated on the pre-discount rental price (covers gateway fees, hosting, marketing, support) |
| Promotions | Discount cost shared 50/50, unless the owner opts out in the dashboard. Commission stays on the pre-discount price during pre-seed and can be switched to post-discount later |
| Late-return penalties | Split 50/50 |
| Down payment / balance | The 50% online down payment confirms the reservation and is the only online charge; the remaining 50% balance is collected offline (cash/QRIS) and recorded by staff at check-out |
| Mechanical-failure refunds | The online down payment is refunded to the renter and the offline balance is returned in cash; the refunded amount is reversed against the owner ledger only, and the platform commission is not reversed |
| Cut-off | Monday 00:00 to Sunday 23:59 WIB |
| Payout | Tuesdays by bank transfer; IDR 100,000 minimum, otherwise rolls over |
| Disputes | Raised within 7 days of payout; resolved within 3 business days |

Because returns stay within one owner, there are no inter-owner transfers to settle. Revenue from every outlet of an owner accrues to that owner ledger and is tagged by outlet.

Each owner receives an automated weekly statement showing gross revenue, commission, promotion and late-fee adjustments, refunds, rollover balance and net payout, with line-level drill-down to individual rentals. Performance reports cover utilization by category and outlet, peak hours, average rental length, and bikes with repeated faults.

## 8. Owner Asset Security

Owners should feel their bikes are safer than under a manual notebook system. The design delivers this through a scan-based custody trail, photo-backed condition checks at both ends of every rental, a 50% down payment as the primary anti-spam control, physical collateral (KTP, SIM or vehicle) held offline by staff at check-out, a clear overdue escalation path, and a hard rule that no rental ends without a staff scan at a registered storefront. Admin work disappears: no manual availability updates, no spreadsheet reconciliation and no hand-calculated payouts.

## 9. Roadmap and Success Measures

- **Phase 1 (launch):** all four outlets, multi-bike reservation lock, 50% down payment through the mock `FakeGateway`, staff scanning with physical-collateral logging, basic dashboard.
- **Phase 2:** automated weekly statements, promotions engine, full performance reports.
- **Phase 3:** sister-outlet groups in production use, e-bike category.

**Targets:** zero overbooking incidents; zero unaccounted bikes at weekly close; inventory drift under 1% on the 5-minute check; payout statements matching ledger at 100%; measurable weekly admin time saved per owner.

## 10. Decisions and Open Items

Confirmed decisions:

1. Commission is calculated on the pre-discount price during the pre-seed stage, and can be switched to post-discount later.
2. Mechanical-failure refunds pay the online down payment back to the renter in full and return the offline balance in cash. The owner bears the whole online refund, and the platform commission is not reversed.
3. No account or digital ID verification is required to rent a bike (revision 1.2): guests book with a contact phone number and the 50% down payment is the primary anti-spam control; physical collateral is collected at check-out. There is no digital security deposit. Renter accounts exist primarily to claim platform and owner promotions and vouchers.
4. A reservation may lock more than one bike (`quantity`); the down payment confirms it and the offline balance is collected by staff at check-out.
5. A confirmed reservation is held for 1 hour after its scheduled rental start, then released as a no-show; the down payment is refunded or retained per the configured refund policy.
6. Phase 1 payments run exclusively through the mock `FakeGateway`; a real gateway is added after a sandbox check in Phase 2.

Configurable seed data (owners may change every amount; the values below are illustrative mock data, not policy):

- **Pricing tiers.** Weekday and weekend rates per category (for example commuter Rp 10,000/15,000, road Rp 20,000/30,000, MTB Rp 15,000/20,000, fixie Rp 10,000/15,000), with a fallback to an "all days" rate.
- **Down-payment rate.** Seed 50% of the final price.
- **Late fee.** Seed Rp 20,000 per started 30 minutes, collected online (payment intent) or offline at the counter.
- **Lost-unit penalty.** Seed Rp 4,000,000, settled offline against the renter's physical collateral.
- **Booking window.** Maximum quantity per reservation (seed 5) and the maximum advance booking window.

On hold for further meetings:

1. The exact weekday/weekend rate card and penalty amounts per owner — these are seed values that owners configure; final values are set before launch.
