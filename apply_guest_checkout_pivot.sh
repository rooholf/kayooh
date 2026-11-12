#!/usr/bin/env bash
#
# apply_guest_checkout_pivot.sh — TPM backlog surgery for the Guest Checkout
# pivot (SRS revision 1.2). Closes the obsolete FR-ID-04 issues and opens
# NEW-C "Guest Checkout & Optional Auth" for the Backend Specialist
# (ISSUE_SKILL_MAP.md revision 3 → skill `implement_zod_contract_route`).
#
# Preconditions: `gh` authenticated with access to the repo.
# Usage: bash apply_guest_checkout_pivot.sh
#
set -euo pipefail

REPO="rooholf/kayooh"

echo "== Guest Checkout pivot: closing obsolete FR-ID-04 issues =="

# 1) Close the FR-ID-04 backend issue (#5) permanently — reason NOT_PLANNED,
#    with a comment that anchors the closure to SRS revision 1.2 so the audit
#    trail explains WHY verification was abandoned, not just that it was.
gh issue close 5 \
  --repo "$REPO" \
  --reason "not planned" \
  --comment "Closed (not planned) — **obsolete per SRS revision 1.2 (Guest Checkout pivot).**

FR-ID-04 is deleted from the SRS entirely: 'Renter ID verification' no longer exists as a feature. Specifically (SRS §FR-ID-04, §FR-INV-02):

- The \`VerificationProvider\` interface (and \`ManualReviewProvider\`) is removed from the P1 interfaces list.
- The \`verification_requests\` and \`id_document_views\` tables, the \`verification_status\` column/enum and the \`verification_result\` notification template **do not exist**.
- \`POST /renters/me/id-documents/upload-url\` and \`POST /renters/me/verification\` are not endpoints.
- \`POST /reservations\` **never returns 422 VERIFICATION_REQUIRED** and carries no \`verification_status\` blocks.

A renter's good faith is now secured by (a) the **50% online down payment** (FR-INV-02) as the primary anti-spam/no-show control, and (b) the **physical collateral (KTP/SIM/vehicle) that staff collect and log offline at check-out** (FR-RNT-01, V-COLLATERAL). No digital identity document is ever uploaded, stored or reviewed by the platform.

Conversion work continues in the new **Guest Checkout & Optional Auth** issue (NEW-C)." 2>/dev/null || echo "  (skipped: #5 not found or already closed — verifying below)"

# 1b) Close the companion verification-upload UI issue (#23) — it has no
#     feature left to build. Keeping scope tight: comment only, no new issue.
gh issue close 23 \
  --repo "$REPO" \
  --reason "not planned" \
  --comment "Closed (not planned) — the backend FR-ID-04 feature this UI was gated on is removed in SRS revision 1.2 (see #5). Any verification upload surface/scaffold in \`apps/web\` must be deleted (mapped as dead code in ISSUE_SKILL_MAP.md §1 Step 6)." 2>/dev/null || echo "  (skipped: #23 not found or already closed)"

echo ""
echo "== Creating NEW-C: Guest Checkout & Optional Auth =="

# 2) Create the NEW-C issue. The --body instructs the Backend Specialist to
#    (a) remove every verification_status block from POST /reservations,
#    (b) support unauthenticated booking payloads (contactPhone + 50% DP),
#    (c) gate promos behind actual authenticated sessions.
ISSUE_URL=$(gh issue create \
  --repo "$REPO" \
  --title "[Step 6] FR-ID-01/FR-INV-02 · Guest Checkout & Optional Auth (revision 1.2)" \
  --body "$(cat <<'BODY'
## Context

SRS **revision 1.2 (Guest Checkout & optional renter auth)** removes mandatory digital ID verification (FR-ID-04 deleted, see #5) in favor of a **public `POST /reservations`** to maximize conversion. Sign-in is now **optional** (FR-ID-01): a renter may book from a public, unauthenticated session. The **50% online down payment (FR-INV-02)** is the primary anti-spam and no-show control; physical collateral (KTP/SIM/vehicle) stays **offline at staff check-out** (FR-RNT-01, V-COLLATERAL). Renter accounts exist **primarily to claim platform and owner promotions and vouchers** (incentivized auth), and secondarily for booking history.

## Persona & skill

- **Persona:** Backend Specialist (AGENTS.md #2)
- **Workflow:** **`implement_zod_contract_route`** (bound in `ISSUE_SKILL_MAP.md` revision 3) — strict Zod `.fastify`-mapped schemas in `packages/contracts`, Fastify route in `apps/api`, error envelope mapping, `Idempotency-Key` enforcement. Companion skills for this issue: `setup_drizzle_rls_schema` (the `idempotency_keys.guest_phone` migration, A-17) and `calculate_integer_money` (DP math stays `bigint`, INV-5).

## Backend Specialist instructions (mandatory)

### 1. Remove every `verification_status` block from `POST /reservations`
- The reservation route must **never** check renter verification status and must **never return 422 `VERIFICATION_REQUIRED`**. Delete the verification pre-check from the hold transaction's pre-check chain (FR-INV-02 order: schema → identity → opening hours → window → duration → category → promo → lock).
- Purge all FR-ID-04 remnants: `VerificationProvider` interface, `verification_requests` / `id_document_views` tables, `verification_status` column/enum, `verification_result` notification template, `POST /renters/me/id-documents/upload-url`, `POST /renters/me/verification`, and the admin verification queue. No digital identity document is ever uploaded, stored or reviewed by the platform.

### 2. Support unauthenticated booking payloads — phone number + 50% DP
- `POST /api/v1/reservations` becomes **public (guest or renter)**. Inputs: `outletId`, `category`, `quantity?`, `startsAt`, `endsAt`, `promoCode?`, `contactPhone?` (V-PHONE) + `Idempotency-Key` header (still REQUIRED).
- **`contactPhone` is REQUIRED when the request is unauthenticated (400 when missing) and REJECTED with 400 when it IS authenticated** — no identity mixing in one request.
- Identity: an authenticated session resolves to the session's renter; an unauthenticated request **resolves or creates the guest `renters` row keyed by the normalized phone** (`+62…`) with `user_id = NULL` (A-17). Phone is the booking identity across guest and authenticated use.
- The **50% DP stays the gate**: `dpIdr = roundHalfUp(finalIdr × 50% )` via `calculate_integer_money` — the 201 still fails the booking into `held` until the DP invoice is paid; the DP is the primary anti-spam control, **not** verification and **not** a penalty.
- Anti-spam backstop: `booking.max_active_reservations_per_phone` (default 3, A-19) → **409 `DUPLICATE_RESOURCE`** for that phone's 4th open reservation.
- Idempotency guest keying (SRS §3.2): guests scope the key to `contactPhone` — `idempotency_keys` gains `guest_phone` with `CHECK ((user_id IS NULL) <> (guest_phone IS NULL))` and `UNIQUE NULLS NOT DISTINCT (key, user_id, guest_phone)`. Same key + same body (12–24 h) replays the stored response with `Idempotent-Replay: true`; same key + different body → 422 `IDEMPOTENCY_KEY_REUSED`; same key while the first runs → 409 `IDEMPOTENCY_IN_PROGRESS`.
- Response **201 `{reservation, price, paymentUrl?, guestToken?}`** — `guestToken` (A-18) is present on guest bookings: a reservation-scoped signed token (delivered in the 201 body **and** by WhatsApp to `contactPhone`) that grants **only** `GET /reservations/{id}` and `GET /reservations/{id}/voucher` for that one reservation. Guests have **no list endpoint**. Guest no-show/refund notifications go by WhatsApp to `contactPhone`.
- Holding/settling flow is unchanged otherwise (FR-INV-02 lock, `release-hold` job, sweeper FR-INV-03 — the no-show run already notifies the affected channel).

### 3. Gate promos behind actual authenticated sessions
- `promoCode` on an **unauthenticated** request → **401 `UNAUTHENTICATED`**. Promotions require an account — that is the conversion incentive for sign-up. There is no guest promo validation path; the route short-circuits before promo evaluation for guests.

## Acceptance criteria (SRS)

1. Unauthenticated booking with a valid `contactPhone` → 201 with `guestToken`; the reservation's `renters` row has `user_id = NULL`.
2. Authenticated request **carrying** `contactPhone` → 400. Unauthenticated request **missing** `contactPhone` → 400.
3. `promoCode` without a session → 401 `UNAUTHENTICATED`.
4. No code path returns 422 `VERIFICATION_REQUIRED`; `grep -ri "verification" apps/api packages/contracts` returns no endpoint/table/scaffold references.
5. A guest booking with `Idempotency-Key` K + phone P replays the stored 201 (`Idempotent-Replay: true`); K with a different body → 422 `IDEMPOTENCY_KEY_REUSED`.
6. OTP verify from the guest's phone **links** the guest `renters` row by setting `user_id` instead of inserting a duplicate (A-17) — guest bookings become visible in the account afterwards.
7. `booking.max_active_reservations_per_phone` honoured: 4th open reservation for one phone → 409 `DUPLICATE_RESOURCE`.
8. Guest fetches the voucher via `Authorization: Bearer <guestToken>`; the token grants nothing else (no list, no cancel, no rental access — NEG-3).

## Dependencies

- **#16** — FR-PAY-02 webhook + FR-PAY-03 refunds must confirm the DP before `confirmation` (the guest flow's core control).
- **NEW-A** — multi-bike `quantity` + DP core lands in the same hold transaction seam (execute NEW-A first; do not mix the two PRs).
- Gates: NFR-09 (lint, `tsc --noEmit`, Vitest against real Postgres, T-01).
BODY
)" 2>/dev/null)

if [ -n "${ISSUE_URL:-}" ]; then
  echo "  created: $ISSUE_URL"
  NEW_C_NUMBER="${ISSUE_URL##*/}"
else
  echo "  WARNING: create failed or output empty — create the issue manually with the body from ISSUE_SKILL_MAP.md revision 3."
  NEW_C_NUMBER="NEW-C"
fi

echo ""
echo "== Summary =="
echo "Closed : #5 (FR-ID-04 backend), #23 (FR-ID-04 UI) — reason: not planned (SRS revision 1.2)"
echo "Created: ${NEW_C_NUMBER} (NEW-C · Guest Checkout & Optional Auth → skill \`implement_zod_contract_route\`)"
echo "Next   : update ISSUE_SKILL_MAP.md NEW references to the concrete issue number; T-13 (#10) dependency list now includes NEW-C."
