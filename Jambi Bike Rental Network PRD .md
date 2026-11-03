# Jambi Bike Rental Network: PRD and System Architecture

Version 1.0 | 3 November 2026 | For fleet owners and the platform team

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

- **Renter:** finds an outlet with the right bike type, pays, collects, returns.
- **Outlet staff:** hands over and receives bikes using a scanner app.
- **Owner:** monitors fleet health, utilization and earnings in a Tenant Dashboard.
- **Platform admin:** onboards owners, manages promotions, handles disputes and payouts.

## 4. Feature Specification

### 4.1 Outlet-based discovery

Renters browse a list and map of outlets only. Each outlet card shows live availability by category (Commuter, Road, MTB, Fixie), opening hours, address and distance from the renter. The renter location is used only to sort outlets and is never tied to a bike. Outlet profiles reflect their character: Danau Sipin shows no road bikes, and Pasar Jambi highlights cargo-rack commuters.

### 4.2 Reservation

Before any rental, the renter must complete ID verification and place a security deposit; no bike can be reserved without both. The renter then picks an outlet, category and time window and pays through the payment gateway (cards, GoPay, OVO), which produces a signed QR voucher. Unpaid checkout holds lapse after a 15-minute payment window so stock is not blocked. A paid reservation is held for 1 hour after its scheduled start time. If the renter has not collected the bike by then, the reservation is marked no-show and the bike is released. Whether a no-show carries a penalty depends on the booking payment structure, which is on hold (see section 10).

### 4.3 Check-out (handover)

Staff scan the renter QR and the bike asset tag, complete a short condition checklist with photos, and confirm. This scan is the only action that moves a bike into a rental.

### 4.4 Check-in (return)

The renter returns the bike to the booking outlet or another outlet of the same owner. Staff scan the bike, inspect it and confirm. A rental cannot be ended from the renter phone. Until a staff scan happens, the rental stays open and late fees accrue.

### 4.5 Late, damage and failure handling

Overdue rentals follow an escalation path: reminder, staff call, owner flag, claim. Damage found at check-in is logged against the photos from check-out and can be claimed against the renter deposit. Mechanical failures during a rental trigger a full refund to the renter and move the bike to Maintenance.

### 4.6 Tenant Dashboard (owners)

Real-time rentals, bike status by outlet, utilization per category, earnings accruals, late returns, refunds, maintenance downtime and downloadable weekly statements. Owners see only their own tenant data.

### 4.7 Admin console

Owner and outlet onboarding, bike registration, pricing and promotion rules, settlement runs, dispute queue and audit log.

## 5. Booking-to-Inventory Lock

**Bike states:** Available, Held (payment pending, expiring), Reserved (paid), In Rental (staff scan-out), Pending Inspection (staff scan-in), Maintenance, Unavailable. A Charging state exists in the model for future e-bikes.

**Lock rules**

- Availability per outlet, category and time window is computed on the aggregator server as in-service bikes minus held, reserved and in-rental bikes for overlapping windows. Reservation writes run in a single database transaction with row-level locking, so two renters cannot claim the last bike.
- Only a staff scan changes physical custody. The app never infers custody from a phone.
- The 5-minute outlet health sync carries maintenance and condition updates and runs a drift check. It is never the lock itself, so a sync delay cannot cause overbooking.
- If staff report a bike missing or damaged, the system blocks it at once, recalculates availability and offers affected renters an alternative bike or outlet.
- Small categories can carry an optional one-bike safety buffer, configured by the owner. Reserved bikes not collected within 1 hour of the scheduled start are released automatically.

Every bike therefore has a continuous custody trail: which outlet, which staff member, which renter, and when.

## 6. System Architecture

**Clients:** renter mobile app, staff scanner app (works offline, queues scans with timestamps and syncs when connectivity returns), owner web dashboard, admin console.

**Services**

- Identity and tenancy (roles, owner isolation, renter ID verification and deposits)
- Outlet and catalog (outlets, sister groups, bike categories)
- Inventory and reservation (the lock)
- Rental lifecycle (check-out, check-in, late and damage rules)
- Pricing and promotions
- Payments (gateway integration, refunds)
- Ledger and settlement
- Notifications (push and WhatsApp)
- Reporting

**Data and infrastructure:** PostgreSQL as the system of record with a tenant ID on every row and row-level security; Redis for hold expiry timers; an event bus so rental events feed the ledger and reports; object storage for condition photos; an append-only audit log.

**Core entities:** Owner, Outlet, SisterGroup (owner-scoped), Bike (asset tag, category, home outlet, current outlet, state), Renter (with ID verification status), Deposit, Reservation, Rental, LedgerEntry, Payout.

**Security:** rotating signed QR tokens, mandatory renter ID verification and deposit before any rental, immutable custody records, and server-side authority over all stock decisions even when staff devices are offline.

**Scalability:** a new outlet or owner is data onboarding. New categories such as e-bikes are added through category attributes (battery, charge state) without schema redesign.

## 7. Financial Reporting and Settlement

The ledger applies the agreed revenue model automatically at rental completion.

| Rule | Treatment |
| --- | --- |
| Standard split | 82% owner, 18% platform, calculated on the pre-discount rental price (covers gateway fees, hosting, marketing, support) |
| Promotions | Discount cost shared 50/50, unless the owner opts out in the dashboard. Commission stays on the pre-discount price during pre-seed and can be switched to post-discount later |
| Late-return penalties | Split 50/50 |
| Mechanical-failure refunds | Renter refunded in full; the refunded amount is reversed against the owner ledger only, and the platform commission is not reversed |
| Cut-off | Monday 00:00 to Sunday 23:59 WIB |
| Payout | Tuesdays by bank transfer; IDR 100,000 minimum, otherwise rolls over |
| Disputes | Raised within 7 days of payout; resolved within 3 business days |

Because returns stay within one owner, there are no inter-owner transfers to settle. Revenue from every outlet of an owner accrues to that owner ledger and is tagged by outlet.

Each owner receives an automated weekly statement showing gross revenue, commission, promotion and late-fee adjustments, refunds, rollover balance and net payout, with line-level drill-down to individual rentals. Performance reports cover utilization by category and outlet, peak hours, average rental length, and bikes with repeated faults.

## 8. Owner Asset Security

Owners should feel their bikes are safer than under a manual notebook system. The design delivers this through a scan-based custody trail, photo-backed condition checks at both ends of every rental, mandatory renter ID verification and deposit, a clear overdue escalation path, and a hard rule that no rental ends without a staff scan at a registered storefront. Admin work disappears: no manual availability updates, no spreadsheet reconciliation and no hand-calculated payouts.

## 9. Roadmap and Success Measures

- **Phase 1 (launch):** all four outlets, reservation lock, staff scanning, payments, basic dashboard.
- **Phase 2:** automated weekly statements, promotions engine, full performance reports.
- **Phase 3:** sister-outlet groups in production use, e-bike category.

**Targets:** zero overbooking incidents; zero unaccounted bikes at weekly close; inventory drift under 1% on the 5-minute check; payout statements matching ledger at 100%; measurable weekly admin time saved per owner.

## 10. Decisions and Open Items

Confirmed decisions:

1. Commission is calculated on the pre-discount price during the pre-seed stage, and can be switched to post-discount later.
2. Mechanical-failure refunds are paid to the renter in full. The owner bears the whole refunded amount, and the platform commission is not reversed.
3. ID verification and a deposit are required before a renter can rent any bike.
4. A reserved bike is held for 1 hour after its scheduled rental start, then released as a no-show.

On hold for further meetings:

1. Down-payment: whether to adopt it at all, its size, when the balance is paid, and the no-show penalty tied to it (discussed rule: renter forfeits 30%, split 50/50 between platform and owner). Until decided, the booking flow and ledger carry no down-payment and no no-show forfeit.
2. ID verification method and provider. The requirement itself stands.
3. Deposit amount, and when it is released or claimed.
