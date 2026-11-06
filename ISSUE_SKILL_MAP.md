# ISSUE_SKILL_MAP — Phase 1 Execution Paths

**Persona:** Technical Project Manager (AGENTS.md #6)
**Sources of truth:** `SRS_Jambi_Bike_Rental_Platform.md` (v1.2, §6 FRs, §9 NFRs, §10 tests, §12 order), `Jambi Bike Rental Network PRD .md` (v1.1), `AGENTS.md` (personas), `SKILLS.md` (workflows)
**Branch scanned:** `staging` · **Date:** 2026-11-07 · **Revision:** 4 (reconciliation — backend closed; renter-web unblocked)

> **Revision 2 — architecture pivot.** The digital security deposit is removed: **FR-ID-05 no longer exists** and issues **#6** and **#24** are **closed (not planned)**. Phase 1 Step 6 is re-scoped to: **multi-bike reservations** (`quantity`), a **50% down payment** (FR-INV-02), **physical collateral + asset-tag array logging** at staff check-out (FR-RNT-01), and **mock payments via `FakeGateway`**. The Backend Specialist and Web Frontend Developer are re-tasked accordingly; the staff collateral work goes to the Offline PWA Engineer. Two new issues are created by `apply_phase1_pivot_backlog.sh` and referenced below as **NEW-A** (backend DP + quantity core) and **NEW-B** (staff collateral checkout event); their numbers are assigned on creation.
> **Revision 3 — guest checkout (SRS revision 1.2).** Mandatory digital ID verification is eliminated in favor of Guest Checkout to maximize conversion: **FR-ID-04 no longer exists** (`verification_requests`, `id_document_views`, `VerificationProvider`, `verification_status`, the `verification_result` template and the 422 `VERIFICATION_REQUIRED` error are all deleted) and issues **#5** (backend verification) and **#23** (verification upload UI) are **closed (not planned)**. A new backend issue **NEW-C — Guest Checkout & Optional Auth** (created by `apply_guest_checkout_pivot.sh`, executed with **`implement_zod_contract_route`**) re-tasks the Backend Specialist: `POST /reservations` is **public**; guests book with `contactPhone` (required when unauthenticated, 400 when authenticated) + the **50% DP** as the primary anti-spam control; **promos are gated behind actual authenticated sessions** (`promoCode` without a session → 401 `UNAUTHENTICATED`); `idempotency_keys` scope guest keys to `contactPhone` (`guest_phone`); guest access is the reservation-scoped **`guestToken`** (A-18, 201 response + WhatsApp) — no list endpoints. Login stays optional (FR-ID-01); OTP verify from a guest phone **links** the guest `renters` row instead of duplicating it (A-17). Physical collateral (KTP/SIM/vehicle) remains **offline at staff check-out** (FR-RNT-01).
> **Revision 4 — reconciliation (2026-11-07).** Every backend issue is now **closed and green**: **#7, #8, #9, #11, #15, #16, #17, #18, #27 (NEW-A), #28 (NEW-B), #29 (NEW-C)**. The scan found **three SRS §7.1 renter endpoints with no route** — `POST /pricing/quote`, `GET /reservations`, `GET /reservations/{id}/voucher`; they are tracked as **#31 (NEW-D)**, the only remaining backend issue and the blocker for **#22**. Renter-web **#20, #21, #26 are unblocked**; **#22 is blocked by #31**, **#25 by #22**, and **T-13 (#10) by #20–#22**. Step 7 pages (#12/#13) are unblocked by #11/#9 closing.

This document binds every **remaining Phase 1 issue** to the workflow that executes it safely and to the persona that owns it. Frontend/UI work maps to the existing **`impeccable`** skill; backend/QA work maps to the skills in `SKILLS.md` (three appended for this purpose: `implement_redis_sse_stream`, `implement_transactional_outbox`, `run_playwright_e2e`).

---

## 1. Phase 1 progress — confirmed by repository scan

Implementation order is SRS §12; Phase 1 is steps 1–7.

| Step | SRS scope | Status | Grounded evidence | Remaining issue(s) |
|---|---|---|---|---|
| **1** | `packages/db`: schema, enums, RLS, triggers, partial unique index, seed §1.1; tests T-02/T-08/T-11/T-12 | **Done** | `packages/db/src/schema.ts`, migrations `0000–0007`, `0001_rls_and_guards.sql` (`app_rls`/`app_service`, owner policy, INV-6 triggers, transition index); `t-02`/`t-08`/`t-11`/`t-12` tests | — (was #15, closed) |
| **2** | Identity (FR-ID-01…03 — sign-in optional, revision 1.2), config store, audit (FR-SEC-02), error envelope, idempotency (guest keying) | **Done** | `modules/identity` (otp/guards/service/routes/Better Auth), `modules/app-config`, `modules/audit`, `lib/{errors,error-handler,idempotency}.ts`; guest keying via `idempotency_keys.guest_phone`; `identity`/`config`/`idempotency` tests | — (NEW-C = #29, closed) |
| **3** | Inventory core: FR-INV-01, FR-INV-02 (**public guest checkout: `contactPhone`, `guestToken`**), FR-PRC-01, **FR-PAY-02, FR-PAY-03** w/ `FakeGateway`; tests T-01/T-04/T-09/T-10 | **Done — re-scoped by pivots** | `modules/inventory/{availability,reservation-hold}.ts` (multi-bike `quantity`, 50 % `dpIdr`), `modules/pricing/quote.ts`, `modules/payments`, `modules/reservations/{create,get}-reservation.ts`, `lib/guest-token.ts`; `t-01`/`t-04`/`t-09`/`t-10` + `guest-checkout`; `t-01-concurrency.test.ts`. **`quote()` has no HTTP route yet → #31** | **#31** (NEW-D — `POST /pricing/quote`); NEW-A = #27, NEW-C = #29, #16 all closed |
| **4** | FR-INV-03 jobs and sweeper; test T-03 | **Done** | `modules/jobs/{queue,sweeper}.ts` (hold expiry, no-show, escalation, reallocation) | — (was #17, closed) |
| **5** | Staff PWA + rental lifecycle: FR-OFF-01, FR-RNT-01…05, FR-INV-04, **FR-INV-05**, FR-SEC-01; tests T-07/T-15/T-16 | **Done — re-scoped by pivot** | `modules/staff/events.ts` (all 5 event types incl. `bikeAssetTags[]`/`collateral`/`balanceCollection`, idempotent replay), `modules/reallocation`, `modules/sse`, `lib/voucher.ts`; `t-07`, `t-15`, `t-16` tests; `apps/staff` PWA | — (NEW-B = #28, #18 closed); voucher **route** → #31 |
| **6** | Catalog + renter site: FR-CAT-01, FR-CAT-02, **FR-ID-01 optional sign-in / guest surfaces**, ~~FR-ID-04~~, ~~FR-ID-05~~, FR-REP-02, FR-NOT-01; test T-13 | **In progress** | FR-CAT-01 complete on API (`modules/catalog`) **and** web (`(renter)` app); SSE (`modules/sse`) and the notification outbox are implemented (#7/#8 closed). Renter web: outlets + `/booking` checkout exist; no `/masuk` or `/reservations` surface | **#10**, **#20–#22, #25, #26**, **#31** |
| **7** | Basic owner dashboard (FR-REP-01 P1) + admin console pages | **Partial — pages not started** | `modules/owner` (incl. the #11 summary API) done; `(owner)/dashboard/page.tsx` and `(admin)/admin/page.tsx` are still `<main>` stubs | **#12, #13** (#11 closed) |

**Conclusion:** Phase 1 is mid-way through **Step 6**. Every backend carry-over and pivot gap is now **closed and green** (#7, #8, #9, #11, #15, #16, #17, #18, #27=NEW-A, #28=NEW-B, #29=NEW-C). The **only remaining backend work is #31 (NEW-D)** — the three un-routed SRS §7.1 renter endpoints (`POST /pricing/quote`, `GET /reservations`, `GET /reservations/{id}/voucher`). **#31 is the hard blocker for #22** (voucher/list surface) and a dependency of **#21** (quote) and **#10** (T-13); **#20, #21, #26 are otherwise unblocked** and may proceed contract-first. Step 7 pages (#12, #13) are unblocked by #11/#9 closing and are not started. Phase 2 must not begin until **#10, #12, #13, #20–#22, #25, #26 and #31** are closed and green (AGENTS.md #6 phase boundary).

---

## 2. Skill inventory

**Existing (`SKILLS.md`):** `setup_drizzle_rls_schema`, `implement_zod_contract_route`, `build_transactional_inventory_lock`, `implement_offline_staff_event`, `calculate_integer_money`.

**Appended to `SKILLS.md` in this pass (gap-fill requested):**
| Skill | Fills the gap for |
|---|---|
| `implement_redis_sse_stream` | FR-REP-02 — Redis pub/sub fan-out, `/outlets/stream` + `/owner/stream`, owner filtering, heartbeat |
| `implement_transactional_outbox` | FR-NOT-01 and every domain-event emit — outbox-after-commit, idempotent delivery, backoff |
| `run_playwright_e2e` | T-13 — full Playwright multi-bike flow against a seeded API + `next start` + `FakeGateway` |

**Pivot-critical existing skill:** `calculate_integer_money` is the mandated path for the **50% DP math** (`dpIdr = roundHalfUp(finalIdr * booking.dp_rate_bps / 10000)`, INV-5 `bigint`).

**Frontend skill (existing, invoked by name):** `impeccable` (`.trae/skills/impeccable`, v4.8.0). Build path: `shape` → new-work (surface brief) → build → `polish` / `audit` / `harden`. Existing surface briefs in `apps/web/.impeccable/surfaces/`: `apps-web-src-app-renter.md`, `apps-web-src-app-renter-outlets-id.md`, `apps-web-src-app-renter-reservasi.md`, `apps-web-src-app-admin.md`.

---

## 3. Issue → skill → persona map

### 3.1 Step 6 — backend

| Issue | Feature | Persona | Required skill / workflow | Depends on |
|---|---|---|---|---|
| **#31 (NEW-D)** | **FR-PRC-01.4/5 + FR-SEC-01.1 + FR-RNT-01 renter read surface (revision 1.2)** — `POST /pricing/quote` (public, promo→401), `GET /reservations` (own list, counts only), `GET /reservations/{id}/voucher` (session or guestToken, `confirmed` else 409) | Backend Specialist | **`implement_zod_contract_route`** + `calculate_integer_money` (DP `bigint`, INV-5) | #29 (guest auth), #27 (quote/DP core) |
| **#27 (NEW-A)** | ✅ FR-INV-01/02 Multi-bike `quantity` + 50% DP (`bigint`) core, FR-PRC-01 `day_type` | Backend Specialist | `build_transactional_inventory_lock` + `calculate_integer_money` + `setup_drizzle_rls_schema` (new columns/enum) | — **CLOSED** |
| **#29 (NEW-C)** | ✅ **FR-ID-01/FR-INV-02 Guest Checkout & Optional Auth (revision 1.2)** — public `POST /reservations`, `contactPhone` guest payload, promos gated behind authenticated sessions, `guestToken` (A-18), `guest_phone` idempotency keying | Backend Specialist | **`implement_zod_contract_route`** + `setup_drizzle_rls_schema` (A-17) + `calculate_integer_money` (DP stays `bigint`) | — **CLOSED** (PR #30) |
| **#28 (NEW-B)** | ✅ FR-RNT-01 Check-out logs `bikeAssetTags[]` + `collateral` + offline `balanceCollection` | Offline PWA Engineer | `implement_offline_staff_event` (+ API event handler) | — **CLOSED** |
| ~~#7~~ | ✅ ~~FR-REP-02 SSE streams~~ | — | **CLOSED** | — |
| ~~#8~~ | ✅ ~~FR-NOT-01 Notification outbox~~ | — | **CLOSED** | — |
| ~~#9~~ | ✅ ~~FR-CAT-02 admin onboarding + seed~~ | — | **CLOSED** | — |
| **#10** | T-13 End-to-end multi-bike flow (Playwright) | Quality Assurance & SDET | `run_playwright_e2e` | #29, #7, #8, #16, #27, #28, #20–#22, **#31** |
| ~~#5~~ | ~~FR-ID-04 Renter ID verification~~ | — | **CLOSED — FR-ID-04 removed in revision 1.2 (guest checkout pivot); good faith = 50% DP + offline collateral** | — |
| ~~#6~~ | ~~FR-ID-05 Security deposits~~ | — | **CLOSED — deposit removed in revision 1.1** | — |

### 3.2 Step 6 — renter web frontend (`apps/web`)

| Issue | Feature | Persona | Required skill / workflow | Depends on |
|---|---|---|---|---|
| **#20** | FR-ID-01 sign-in (phone OTP) UI | Web Frontend Developer | **`impeccable`** — `shape` → build → `polish`/`harden` | Step 2 API (done) |
| **#21** | FR-INV-02 multi-bike reservation & 50% DP checkout UI | Web Frontend Developer | **`impeccable`** (brief **exists**: `apps-web-src-app-renter-reservasi.md`) | #20, **#29**, **#31** (quote) — #16/#27 closed |
| **#22** | FR-RNT-01 reservations + voucher QR (surface `quantity` / `dpIdr`) | Web Frontend Developer | **`impeccable`** (same brief) | #21, **#31** (list + voucher) |
| ~~#23~~ | ~~FR-ID-04 verification upload UI~~ | — | **CLOSED — FR-ID-04 removed in revision 1.2 (guest checkout pivot). Any verification UI scaffold in `apps/web` is deleted, not mapped** | — |
| **#25** | FR-INV-04 at-risk reallocation UI | Web Frontend Developer | **`impeccable`** (reuses reservation detail) | #22 |
| **#26** | FR-REP-02 live availability (SSE client) | Web Frontend Developer | **`impeccable`** + consume `implement_redis_sse_stream` output | #7 |
| ~~#24~~ | ~~FR-ID-05 deposit top-up UI~~ | — | **CLOSED — deposit removed in revision 1.1** | — |

*(#19 is the TPM tracking issue for this set — no execution skill.)*

### 3.3 Step 7 — owner dashboard & admin console

| Issue | Feature | Persona | Required skill / workflow | Depends on |
|---|---|---|---|---|
| **#11** | FR-REP-01 (P1) owner dashboard summary API | Backend Specialist | `implement_zod_contract_route` + `setup_drizzle_rls_schema` (FR-ID-03 transaction context) + `calculate_integer_money` | Step 2 (done) |
| **#12** | Owner dashboard page `(owner)` | Web Frontend Developer | **`impeccable`** — **Operate** mode; **`shape`** first (no owner surface brief yet) | #11 |
| **#13** | Admin console pages `(admin)` | Web Frontend Developer | **`impeccable`** — **Operate** mode (brief **exists**: `apps-web-src-app-admin.md`) | #9, #11 |

### 3.4 Phase 1 carry-over (Steps 1–5) — all closed

| Issue | Gap | Persona | Required skill / workflow | Status |
|---|---|---|---|---|
| **#15** | Seed script + T-02/T-08/T-11/T-12 | Lead Platform Architect + QA & SDET | `setup_drizzle_rls_schema` (idempotent seed, NFR-10) + Vitest integration suite | ✅ **CLOSED** |
| **#16** | FR-PAY-02 webhook + FR-PAY-03 refunds, incl. 50% DP confirmation | Backend Specialist | `implement_zod_contract_route` + `implement_transactional_outbox` + `calculate_integer_money` | ✅ **CLOSED** |
| **#17** | `bullmq` undeclared dependency | Lead Platform Architect | Dependency/workspace fix + NFR-09 CI gate | ✅ **CLOSED** |
| **#18** | FR-INV-05 health sync + drift check | Backend Specialist | `implement_zod_contract_route` + `implement_transactional_outbox` (`drift_alert`) | ✅ **CLOSED** |

---

## 4. Frontend mapping detail (`impeccable`)

Every UI issue above executes through the same strict path — no direct hand-editing of surfaces outside it:

1. **`shape <route>`** — task discovery + direction. For #12 (owner) no brief exists yet → `shape` writes the surface brief first. #21/#22/#13 already have committed briefs.
2. **Build** — follow the surface brief; **Operate** mode for the reservation path, dashboards and admin (scanability, honest state), **Persuade** only where a surface is marketing.
3. **`polish` / `harden` / `audit`** — before done: error + empty + loading states, 360 px mobile floor, touch targets ≥ 44 px, WCAG 2.1 AA, `prefers-reduced-motion` (NFR-07).

**Invariants the UI must never violate** (enforced in the `run_playwright_e2e` spec, NEG-2/NEG-4): no bike ids or asset tags rendered anywhere; no coordinates sent by the client; no renter-side cancel/end/relocate-rental control (NEG-3/NEG-8). The reservation surface shows **`quantity`** and the **`dpIdr` / offline balance split** — and there is **no deposit top-up surface**.

---

## 5. Execution rules

- One skill invocation per issue; a PR may not mix a backend skill and a frontend skill without both being listed here.
- A frontend issue whose backend dependency is unmerged (#21 on #16/NEW-A, #26 on #7) builds against a contract-first mock only; it does not mark the backend issue done.
- Every PR passes the NFR-09 gates (lint, `tsc --noEmit`, Vitest against real Postgres, T-01, coverage ≥ 90% on inventory/ledger/pricing). T-13 (`run_playwright_e2e`) gates Step 6.
- **Revision 1.2:** `POST /reservations` is public — a guest books with `contactPhone` + the 50% DP; **promos require an authenticated session** (401 `UNAUTHENTICATED` without one). No PR may reintroduce a `verification_status` check, a `verification_requests`/`id_document_views` table, a `VerificationProvider` system, or the 422 `VERIFICATION_REQUIRED` error. Physical collateral stays offline at staff check-out (FR-RNT-01) — never digital.
- **Revision 1.1:** money is integer rupiah (`bigint`) everywhere (INV-5); the DP must be computed with `calculate_integer_money`/`roundHalfUp`, never floats. No PR may reintroduce a security deposit, a `deposits`/`deposit_claims` table, or `DEPOSIT_REQUIRED`.
- Phase 2 (ledger, commission, promotions, statements, payouts, disputes) starts only when **#10, #12, #13, #20–#22, #25, #26 and #31** are closed and green — the Phase-1 exit criteria (AGENTS.md #6). All backend issues of Steps 1–5 (#7–#9, #11, #15–#18, #27, #28, #29) are already closed.

*Generated by the Technical Project Manager persona. Acceptance Criteria for each issue live in the issue bodies; this map governs how they are executed. Reconciliation commands: `apply_phase1_pivot_backlog.sh`.*
