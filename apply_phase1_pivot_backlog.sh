#!/usr/bin/env bash
#
# apply_phase1_pivot_backlog.sh
# Phase 1 · architecture pivot (v1.1) — GitHub backlog reconciliation
# Persona: Technical Project Manager (AGENTS.md #6)
#
# The pivot removed the digital security deposit and introduced:
#   - multi-bike reservations (`quantity`)
#   - a 50% down payment (DP) that confirms a reservation
#   - physical collateral + a bike-tag array logged at staff check-out
#   - mock payments via `FakeGateway` in Phase 1
#
# This script:
#   1. CLOSES the deprecated digital-security-deposit issues (#6, #24).
#   2. EDITS the issues whose Acceptance Criteria changed under revision 1.1
#      (#20 sign-in, #21 reservation UI, #16 webhook/refunds, #10 T-13).
#   3. CREATES the two new pivot issues:
#        NEW-A  FR-INV-01/02 multi-bike `quantity` + 50% DP (bigint) core  (Backend Specialist)
#        NEW-B  FR-RNT-01 `bikeAssetTags[]` + `collateral` + offline balance (Offline PWA Engineer)
#
# Prereqs: `gh` authenticated against the repo, with issue write scope.
# Usage:   bash apply_phase1_pivot_backlog.sh            # apply
#          bash apply_phase1_pivot_backlog.sh --dry-run  # print only
#
set -euo pipefail

REPO="rooholf/kayooh"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=1; fi

ghrun() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "+ gh $*"
  else
    gh "$@"
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------
# 0. Shared milestone titles used by `gh issue create --milestone`
# ---------------------------------------------------------------------------
MS_STEP6="Phase 1 · Step 6 — Catalog & Renter Site"
MS_STEP7="Phase 1 · Step 7 — Owner Dashboard & Admin Console"
MS_CARRY="Phase 1 carry-over"

# ===========================================================================
# 1. CLOSE — deprecated digital security deposit work (FR-ID-05 removed)
# ===========================================================================
cat > "$TMP/comment_6.md" <<'EOF'
Closing: **FR-ID-05 (security deposit) was removed** in the revision 1.1 architecture pivot.

There is no `deposits`/`deposit_claims` table, no `deposit_status`, and no deposit endpoints (SRS §1.1 revision note, §6.1 "FR-ID-05 (removed)", §5 data model; PRD v1.1 §10). A renter's good faith is now secured by (a) the **50% down payment** (FR-INV-02, tracked by **NEW-A** and #16) and (b) **physical collateral** collected at check-out (FR-RNT-01, tracked by **NEW-B**). Superseded.
EOF

ghrun issue close 6 --repo "$REPO" --reason "not planned" \
  --comment "$(cat "$TMP/comment_6.md")"

cat > "$TMP/comment_24.md" <<'EOF'
Closing: **the deposit top-up UI is obsolete** — FR-ID-05 was removed in the revision 1.1 architecture pivot.

The renter no longer funds a deposit, and `POST /renters/me/deposit` no longer exists (SRS §7.1 endpoint table; PRD v1.1 §4.2/§10). The reservation surface is re-scoped in **#21** to a **multi-bike (`quantity`) reservation confirmed by a 50% down payment**, with the remaining balance collected offline by staff. Superseded.
EOF

ghrun issue close 24 --repo "$REPO" --reason "not planned" \
  --comment "$(cat "$TMP/comment_24.md")"

# ===========================================================================
# 2. EDIT — issues whose Acceptance Criteria changed under revision 1.1
# ===========================================================================

# --- #20 Sign-in: `GET /renters/me` no longer returns deposit fields ---------
cat > "$TMP/body_20.md" <<'EOF'
## Context
**Step 6 — Catalog and renter site** (`apps/web`). The renter app has **no authentication surface** — no `masuk` / login route under `(renter)`, and `GET /renters/me` (SRS §7.1) is not consumed anywhere. Without a session a renter cannot reach any reservation or verification endpoint.

The backend already exists: Better Auth phone-number plugin mounted at `/api/auth/*` (SRS §7 base path), OTP delivered via `NotificationProvider` (FR-ID-01, Step 2 — done).

> **Revision 1.1:** the digital security deposit was removed, so `GET /renters/me` returns **only `{phone, verificationStatus}`** — there is no `depositStatus`/`depositBalanceIdr` and no `/deposit` route to guard.

## Scope (`apps/web`)
1. `/masuk` route: phone entry (V-PHONE) → send OTP → 6-digit OTP entry → verify.
2. Call Better Auth under `/api/auth/*`; establish the session cookie (`HttpOnly; Secure; SameSite=Lax`, NFR-04).
3. Surface `GET /renters/me` → `{phone, verificationStatus}` to drive the **verification** gate (R4 = #23). There is no deposit gate.
4. Client guard: unauthenticated renter hitting `/reservations` or `/verifikasi` is redirected to `/masuk`.
5. Honest error copy for 429 `RATE_LIMITED` and 401 `OTP_INVALID`; mobile-first (NFR-07), AA contrast.

## Acceptance Criteria (exact, from SRS §6.1)

**FR-ID-01 — AC:**
> 6th OTP request within an hour returns 429. A correct OTP after 5 wrong attempts still returns 401. Inputs `081234567890`, `6281234567890` and `+6281234567890` all normalize to `+6281234567890` and resolve to the same user.

**FR-ID-01 — behaviour (verbatim, steps 1–7):**
> 1. Normalize and validate `phone` (V-PHONE).
> 2. Enforce limits: at most 1 OTP per phone per 60 s, 5 per phone per hour, 20 per IP per hour. Otherwise 429 `RATE_LIMITED`.
> 3. Generate a 6-digit numeric OTP with a CSPRNG. Store only its hash. TTL 300 s.
> 4. Send via WhatsApp template `otp`.
> 5. On verify: at most 5 wrong attempts per OTP, then the OTP is invalidated. A wrong, expired or used OTP returns 401 `OTP_INVALID`.
> 6. On first successful verify, in one transaction create the `users` row (role `renter`) and the `renters` row (`verification_status = not_started`).
> 7. Issue a session (TTL 30 days, sliding).

**Endpoint contract (SRS §7.1, verbatim):**
> `GET /renters/me` | renter | none | 200 `{phone, verificationStatus}` | n/a

## Notes / dependencies
- **Blocks #21** (reservation requires a renter session) and all authenticated renter surfaces.
- NEG-2/NEG-4: no bike ids, no coordinates.
EOF

ghrun issue edit 20 --repo "$REPO" \
  --body-file "$TMP/body_20.md"

# --- #21 Reservation & checkout UI: quantity + 50% DP, no DEPOSIT_REQUIRED ----
cat > "$TMP/body_21.md" <<'EOF'
## Context
**Step 6 — Catalog and renter site** (`apps/web`). **This is the "renter reservation" surface and it does not exist.**

Revision 1.1 pivoted the model: there is **no security deposit**; a reservation may book **multiple bikes** (`quantity`) and is confirmed by paying a **50% down payment (DP)** online. The remaining 50% balance is collected **offline** (cash/QRIS) by staff at check-out.

Current state:
- The outlet detail page selects a category into `?jenis=` with the comment *"a later reservation round picks it up"* — but **there is no reservation round**.
- No `/reservations` route; no time-window picker, no `quantity` picker, no price/DP display, no `Idempotency-Key` handling, no payment redirect.
- Backend `POST /reservations` and `POST /pricing/quote` are implemented; contracts exist in `@repo/contracts` (`createReservationBodySchema`, `createReservationResponseSchema`).

## Scope (`apps/web`)
1. Booking sheet/route reachable from outlet detail: choose `startsAt`/`endsAt` snapped to `booking.slot_minutes`, a **`quantity`** (V-QTY, 1..`booking.max_quantity`), carry `category` from `?jenis=`, optional `promoCode`.
2. Price preview via `POST /pricing/quote` → `{priceIdr, discountIdr, finalIdr, dpIdr, units}`; show the **down payment (`dpIdr`)** and the **offline balance (`finalIdr - dpIdr`)** separately.
3. `POST /reservations` with a client-generated **`Idempotency-Key` (UUID)** header; on 201 `{reservation, price, paymentUrl?}` redirect to `paymentUrl` when present, else (when `dpIdr = 0`) show the confirmed reservation directly.
4. Map every SRS error code to honest Indonesian copy: `VERIFICATION_REQUIRED` → R4 (#23); `SOLD_OUT`, window/duration/promo errors. **There is no `DEPOSIT_REQUIRED`.**
5. Hold countdown to `expiresAt`; mobile-first (NFR-07); NEG-2/NEG-4. No cancel/end/relocate-rental control (NEG-3/NEG-8).

## Acceptance Criteria (exact, from SRS §6.4)

**FR-INV-02 — AC (T-01, the protected rule):**
> an outlet with 5 commuter bikes and 50 parallel valid requests (each `quantity = 1`) for the same window yields exactly 5 responses 201 and 45 responses 409 `SOLD_OUT`; `computeAvailability` afterwards returns 0. With the same 5 bikes, one request of `quantity = 3` leaves `available = 2`; a follow-up request of `quantity = 3` returns `SOLD_OUT` and one of `quantity = 2` returns 201.

**FR-INV-02 — pre-transaction validation (verbatim, steps 1–4):**
> 1. Schema (400). Renter `verification_status = verified` else 422 `VERIFICATION_REQUIRED`.
> 2. `endsAt > startsAt`; minutes of `startsAt` and duration are multiples of `booking.slot_minutes`; duration within `booking.min/max_duration_minutes` else 422 `DURATION_OUT_OF_RANGE`; `startsAt >= now + booking.min_lead_minutes` and `<= now + booking.max_advance_days` else 422 `WINDOW_OUT_OF_RANGE`.
> 3. `startsAt` and `endsAt` each fall inside the outlet's `hours` (WIB) else 422 `OUTSIDE_OPENING_HOURS`. Closed time between them is allowed.
> 4. Outlet active and `(outletId, category)` active else 422 `CATEGORY_NOT_OFFERED`.

**FR-INV-02 — down payment (verbatim, step 4):**
> Compute the online down payment: `dpIdr = roundHalfUp(finalIdr * booking.dp_rate_bps / 10000)`. The offline balance is `balanceIdr = finalIdr - dpIdr`, collected by staff at check-out (FR-RNT-01).

**Endpoint contracts (SRS §7.1, verbatim):**
> `POST /pricing/quote` | renter | `outletId, category, quantity?, startsAt, endsAt, promoCode?` | 200 `{priceIdr, discountIdr, finalIdr, dpIdr, units}` | 422 `CATEGORY_NOT_OFFERED`, `PROMO_INVALID`, `AMOUNT_BELOW_MINIMUM`, window and duration codes
>
> `POST /reservations` | renter | header `Idempotency-Key`; `outletId, category, quantity?, startsAt, endsAt, promoCode?` | 201 `{reservation, price, paymentUrl?}` (`paymentUrl` absent when `dpIdr = 0`) | 409 `SOLD_OUT`, `IDEMPOTENCY_IN_PROGRESS`; 422 `VERIFICATION_REQUIRED`, `OUTSIDE_OPENING_HOURS`, `DURATION_OUT_OF_RANGE`, `WINDOW_OUT_OF_RANGE`, `CATEGORY_NOT_OFFERED`, `PROMO_INVALID`, `AMOUNT_BELOW_MINIMUM`, `IDEMPOTENCY_KEY_REUSED`; 502 `GATEWAY_UNAVAILABLE`

## Notes / dependencies
- **Blocks T-13 (#10)** — "Verified renter books a multi-bike reservation" cannot run without this.
- **Blocked by:** #20 (session), #23 (verification), the DP/quantity backend core (**NEW-A**), and #16 (FR-PAY-02 webhook confirms the booking).
- Idempotency: `POST /reservations` is in `IDEMPOTENCY_ROUTES` (SRS §3.2) — the header is REQUIRED.
- **Revision 1.1:** the digital security deposit and `DEPOSIT_REQUIRED` no longer exist; the payment redirect handles the **50% DP** only.
EOF

ghrun issue edit 21 --repo "$REPO" \
  --title "[Step 6] Renter web · FR-INV-02 · Multi-bike reservation & 50% DP checkout flow UI (blocks T-13)" \
  --body-file "$TMP/body_21.md"

# --- #16 webhook + refunds: DP confirmation replaces the deposit branch -------
cat > "$TMP/body_16.md" <<'EOF'
## Context
**Carry-over from SRS §12 Step 3** (Inventory core: FR-INV-01, FR-INV-02, FR-PRC-01 w/o promos, **FR-PAY-02, FR-PAY-03** with `FakeGateway`; tests T-01, T-04, T-09, T-10). Found during the Step-6 progress review (see #14 §4, gap G2). **This is a hard blocker for Step 6's own T-13.**

> **Revision 1.1:** the only online charge is the **50% down payment (DP)**. The `deposit` webhook branch is removed; a late DP that can no longer be honoured is refunded in full (reason `late_payment_sold_out`).

Current state:
- `apps/api/src/modules/payments/gateway.ts`: `PaymentGateway` interface exposes **only** `createInvoice` — missing `getInvoice`, `refund`, `createDisbursement`, `verifyWebhook`. Production throws *"No production PaymentGateway is wired yet"*.
- **No `POST /webhooks/{gateway}` handler exists** (FR-PAY-02). In Phase 1 `gateway = fake`.
- **`issueRefund` is not implemented** (FR-PAY-03).
- Tests **T-04 / T-09 / T-10** are absent.

## Scope
1. Extend the `PaymentGateway` seam (`getInvoice`, `refund`, `createDisbursement`, `verifyWebhook`) and implement it on `FakeGateway`; keep it strictly behind the interface (AGENTS.md #2).
2. Implement `POST /webhooks/{gateway}` (public; `gateway = fake` in P1, `xendit` after G-01) per FR-PAY-02 steps 1–8.
3. Implement `issueRefund({intentId, amountIdr, reason, rentalId?})` per FR-PAY-03.
4. Add tests T-04, T-09, T-10.

## Acceptance Criteria (exact, from SRS §6.5)

**FR-PAY-02 — AC:**
> the same event delivered twice changes the DB once. A DP payment arriving after expiry with capacity below `quantity` produces exactly one refund row.

**FR-PAY-02 — behaviour (verbatim, steps 1–8):**
> 1. Verify the callback token header with a constant-time comparison to the configured secret. Mismatch: 401 `WEBHOOK_SIGNATURE_INVALID`, nothing stored (confirm the exact mechanism against the gateway: a test header on the P1 `FakeGateway`, or the Xendit sandbox after G-01).
> 2. Insert raw payload into `payment_webhook_events`; on `UNIQUE (provider, event_id)` conflict return 200 immediately (duplicate).
> 3. Resolve the intent by `external_id`. Transaction, intent row locked `FOR UPDATE`. If already `paid`: no-op.
> 4. Verify `paid_amount == intent.amount_idr`; otherwise set the event `processed_at` with a failure note, alert admin, change nothing.
> 5. `PAID` for `booking` (this is the 50% DP, `amount_idr = reservation.dp_idr`): if the reservation is `held`: set `confirmed`, `confirmed_at = now()`, intent `paid`. If the reservation is `expired`: re-run FR-INV-02 steps 1 to 2 under the lock; if `available >= quantity` set `confirmed`; else refund the DP in full (reason `late_payment_sold_out`) and notify the renter. Emit `reservation.confirmed` and send `reservation_confirmed`.
> 6. `PAID` for `late_fee`: intent `paid`.
> 7. `EXPIRED` or `FAILED`: intent `expired`/`failed`; the sweeper handles the reservation.
> 8. Always respond 200 within 2 s after commit; unexpected errors return 500 so the gateway retries.

**FR-PAY-03 — Refunds** `issueRefund({intentId, amountIdr, reason, rentalId?})`:
> 1. Insert `refunds` row `pending`, with `amount_idr <= intent.amount_idr - already refunded` (else throw).
> 2. Call `gateway.refund` with idempotency key `refund-<refundId>`. On success: `succeeded`, intent `refunded` if fully refunded; on failure: `failed`, alert admin, retry only from the admin console.
> 3. Notify the renter (`refund_issued`). Emit outbox `refund.issued` (P2 ledger consumes it).

**Test matrix additions (§10):**
- **T-04 | FR-PAY-02:** Deliver the same paid event twice: one state change. Late DP with capacity below `quantity`: one refund row. Wrong amount: no state change.
- **T-09 | FR-INV-01:** Table-driven availability cases from the FR-INV-01 AC, including `quantity`, an overdue rental and the buffer.
- **T-10 | FR-PRC-01, FR-RNT-02:** Table-driven pricing and late-fee cases from the ACs (61 min gives 2 units; 12:15 / 12:16 / 13:01 late fees).

## Notes / dependencies
- **Blocks #10 (T-13), NEW-A and #21.** The former deposit-credit dependency (#6) is closed — see #6.
- Gate **G-01** (Xendit sandbox confirmation) is required before the production adapter; build against `FakeGateway` first.
- Endpoint contract: SRS §7.1 `POST /webhooks/{gateway}` (public).
EOF

ghrun issue edit 16 --repo "$REPO" \
  --title "[Carry-over] G2 · FR-PAY-02 webhook + FR-PAY-03 refunds (50% DP confirmation; hard blocker for Step 6 T-13)" \
  --body-file "$TMP/body_16.md"

# --- #10 T-13: multi-bike checkout with the FakeGateway -----------------------
cat > "$TMP/body_10.md" <<'EOF'
## Context
SRS §12 **Step 6** explicitly lists *"Test T-13."* Today only a renter-discovery visual smoke exists (`apps/web/e2e/renter.spec.ts`). Revision 1.1 requires the end-to-end test to cover a **multi-bike** reservation confirmed by a **50% down payment** through the mock **`FakeGateway`**, checked out with an **array of asset tags** and logged **physical collateral**.

## Scope
Author the SRS §10 T-13 Playwright end-to-end test covering the complete P1 spine against a seeded API + `FakeGateway`:

- Verified renter books a reservation with **`quantity = 2`**.
- `POST /pricing/quote` returns `finalIdr` and `dpIdr`; the `POST /reservations` call returns a `paymentUrl` for the DP.
- A **FakeGateway paid event** confirms the reservation (`held` → `confirmed`).
- Staff scans the voucher and **two** bike asset tags at check-out, logs **`collateral`** (e.g. `ktp`) and records the offline **`balanceCollection`**.
- Staff check-in (one scan per bike).
- Inspection `pass`.

## Acceptance Criteria (exact, SRS §10 T-13)
> **T-13** | End to end (Playwright) | Verified renter books a reservation with `quantity = 2`; FakeGateway DP paid event confirms it; staff scans voucher, checks out 2 bikes with `bikeAssetTags` (length 2), logs `collateral`, and records the offline `balanceCollection`; staff check-in; inspection `pass`. Expect 2 `rentals` `completed` (sharing the reservation), bikes `available`, availability restored.

## Notes / dependencies
- **Blocked by:** FR-ID-04 (#5, verified renter), **FR-INV-01/02 (NEW-A)** for `quantity` + DP, **FR-RNT-01 (NEW-B)** for the asset-tag array + collateral, and **FR-PAY-02 (#16)** for the FakeGateway paid event.
- The deposit dependency (former #6) is removed.
- NFR-09: this test is part of the blocking CI quality gate.
- The staff flow (check-out / check-in / inspection) is implemented in `modules/staff/events.ts` and re-scoped by NEW-B.
EOF

ghrun issue edit 10 --repo "$REPO" \
  --title "[Step 6] T-13 · End-to-end multi-bike rental flow (Playwright + FakeGateway)" \
  --body-file "$TMP/body_10.md"

# ===========================================================================
# 3. CREATE — the two new pivot issues
# ===========================================================================

# --- NEW-A: multi-bike quantity + 50% DP (bigint) core -----------------------
cat > "$TMP/new_a.md" <<'EOF'
## Context
**Phase 1 · architecture pivot (revision 1.1).** A reservation may now lock **multiple bikes** (`quantity`) and is confirmed by a **50% down payment (DP)**. The current inventory core is single-bike (`available >= 1`) and has no DP concept, so this is the backend foundation for the re-scoped Step 6 reservation flow (#21) and T-13 (#10).

## Scope (`apps/api`, `packages/db`, `packages/contracts`)
1. **`packages/db`** — add:
   - `reservations.quantity smallint NOT NULL DEFAULT 1 CHECK (quantity >= 1)`
   - `reservations.dp_idr bigint NOT NULL DEFAULT 0`
   - `pricing_rules.day_type pricing_day_type NOT NULL DEFAULT 'all'` (new enum `all | weekday | weekend`)
   - change `rentals.reservation_id` from **UNIQUE to a plain index** (one reservation → N rentals).
2. **FR-INV-01 `computeAvailability`** — `committedReservations` = **sum of `quantity`** over held/confirmed overlapping reservations; a request proceeds only when `available >= quantity`.
3. **FR-INV-02 `POST /reservations`** — accept `quantity?` (V-QTY, 1..`booking.max_quantity`); `available < quantity` → 409 `SOLD_OUT`. Compute the DP and insert.
4. **FR-PRC-01** — rate lookup by day type (weekend = Sat/Sun WIB) with a 4-level fallback ending in `(NULL, category, 'all')`.
5. **Config** — `booking.max_quantity` (seed 5), `booking.dp_rate_bps` (seed 5000).

## Acceptance Criteria (exact, from SRS §6.4)

**FR-INV-02 — AC (T-01, the protected rule):**
> an outlet with 5 commuter bikes and 50 parallel valid requests (each `quantity = 1`) for the same window yields exactly 5 responses 201 and 45 responses 409 `SOLD_OUT`; `computeAvailability` afterwards returns 0. With the same 5 bikes, one request of `quantity = 3` leaves `available = 2`; a follow-up request of `quantity = 3` returns `SOLD_OUT` and one of `quantity = 2` returns 201.

**FR-INV-02 — down payment + DP math (verbatim, SRS §6.4 step 4):**
> Compute the online down payment: `dpIdr = roundHalfUp(finalIdr * booking.dp_rate_bps / 10000)`. The offline balance is `balanceIdr = finalIdr - dpIdr`, collected by staff at check-out (FR-RNT-01).

**FR-INV-02 — insert (verbatim, step 5):**
> Insert reservation: `status = held`, `quantity = quantity`, `dp_idr = dpIdr`, `expires_at = now() + hold.checkout_minutes`, price fields and snapshots copied from the quote. If `dpIdr = 0` insert `confirmed` directly and skip steps 6 to 7.

**FR-INV-01 — availability (verbatim, steps 3–5):**
> 3. `committedReservations` = the **sum of `quantity`** over reservations at `(outletId, category)` overlapping the window where (`status = held AND expires_at > now()`) OR (`status = confirmed AND at_risk = false AND starts_at + noshow.grace_minutes > now()`), excluding `excludeReservationId`.
> 5. `available = max(0, inService - buffer - committedReservations - committedRentals)`. A request proceeds only when `available >= reservation.quantity`.

**Test matrix (§10):** T-01 (concurrency, quantity-aware) and T-09 (availability, quantity-aware).

## Notes / dependencies
- **INV-5:** all money is integer rupiah (`bigint`); the DP math MUST use the `calculate_integer_money` skill / `roundHalfUp` and **bigint** arithmetic — no floats, no `parseFloat`/`toFixed`. The lint rule in SRS §9 NFR-05 must pass.
- **Blocks #21** (reservation UI) and **#10** (T-13).
- Depends on **#16** for the payment-intent seam the DP relies on.
EOF

ghrun issue create --repo "$REPO" \
  --title "[Pivot] FR-INV-01/02 · Multi-bike quantity reservations + 50% DP (bigint) core" \
  --label "Backend Specialist" \
  --milestone "$MS_CARRY" \
  --body-file "$TMP/new_a.md"

# --- NEW-B: collateral + asset-tag array at check-out ------------------------
cat > "$TMP/new_b.md" <<'EOF'
## Context
**Phase 1 · architecture pivot (revision 1.1).** Staff now hand over **all bikes of a reservation** in one action, must **collect and log physical collateral** (KTP, SIM or vehicle), and must **record the offline balance payment** (the remaining 50%). The current `checkout` staff event carries a single `bikeAssetTag` and no collateral, so it does not satisfy FR-RNT-01 under revision 1.1.

## Scope (`apps/staff`, `apps/api`, `packages/contracts`)
1. `packages/contracts`: extend the `checkout` event with `bikeAssetTags` (`V-ASSET-TAG[]`), `collateral` (`V-COLLATERAL` = `{type: ktp|sim|vehicle, reference: V-TEXT-S}`), and `balanceCollection` (`{amountIdr: V-IDR, method: cash|qris}`).
2. `apps/staff` (Offline PWA): the check-out screen scans **one tag per bike** (count must equal `reservation.quantity`), captures collateral type + masked reference, and records the offline balance method/amount. Keep the Dexie `scan_events` queue and the change-not-reject flagging (FR-OFF-01).
3. `apps/api` `modules/staff/events.ts` checkout handler per FR-RNT-01 (below).

## Acceptance Criteria (exact, from SRS §6.6)

**FR-RNT-01 — event (verbatim):**
> Event `checkout`: `{clientEventId, occurredAt, voucherToken, bikeAssetTags (V-ASSET-TAG[], length = reservation.quantity), checklist (V-CHECKLIST), photoKeys (V-PHOTO-KEY[], condition.min_photos to max_photos), collateral (V-COLLATERAL), balanceCollection {amountIdr (V-IDR), method: cash|qris}}`.

**FR-RNT-01 — behaviour (verbatim, steps 2 & 5):**
> 2. `bikeAssetTags` MUST contain exactly `reservation.quantity` distinct tags; otherwise rejected `QUANTITY_MISMATCH`. `collateral` is REQUIRED — staff physically collect a KTP, SIM or vehicle and log its masked reference — else rejected `COLLATERAL_REQUIRED`. `balanceCollection.amountIdr` MUST equal the offline balance `final_idr - dp_idr`; otherwise rejected `BALANCE_MISMATCH`.
> 5. Apply in one transaction: insert **one `rentals` row per bike tag** (`reservation_id`, `bike_id`, `expected_end_at = reservation.ends_at`, `checkout_checklist`, `collateral`, `balance_collected_idr`, `balance_method`); set each bike `in_rental`; reservation `fulfilled`; one `bike_events(checked_out, photo_keys)` per bike; outbox `rental.checked_out` per rental.

**FR-RNT-01 — AC:**
> a `no_show` reservation scanned at the counter is flagged `RESERVATION_NOT_CONFIRMED`; no bike state changes. A reservation of `quantity = 2` checked out with two tags creates two `open` rentals sharing the reservation id and the same `collateral`, each with `balance_collected_idr = final_idr - dp_idr`.

**Test matrix (§10):** T-16 (flag reasons incl. `QUANTITY_MISMATCH`, `COLLATERAL_REQUIRED`, `BALANCE_MISMATCH`) and T-13 (multi-bike end-to-end).

## Notes / dependencies
- Depends on **NEW-A** (`quantity`, `dp_idr`) and **#16**.
- NEG-4: no coordinates. The collateral reference is stored **masked** (never a full KTP/SIM number) per NFR-06.
- Persona: Offline PWA Engineer (staff app), with the API handler owned by the Backend Specialist.
EOF

ghrun issue create --repo "$REPO" \
  --title "[Pivot] FR-RNT-01 · Check-out logs bikeAssetTags[] + physical collateral + offline balance" \
  --label "Offline PWA Engineer" \
  --milestone "$MS_CARRY" \
  --body-file "$TMP/new_b.md"

echo
echo "Done. Re-run with --dry-run to preview commands without mutating GitHub."
