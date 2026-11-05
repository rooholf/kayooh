# ISSUE_SKILL_MAP — Phase 1 Execution Paths

**Persona:** Technical Project Manager (AGENTS.md #6)
**Sources of truth:** `SRS_Jambi_Bike_Rental_Platform.md` (v1.1, §6 FRs, §9 NFRs, §10 tests, §12 order), `Jambi Bike Rental Network PRD .md` (v1.1), `AGENTS.md` (personas), `SKILLS.md` (workflows)
**Branch scanned:** `staging` · **Date:** 2026-11-06 · **Revision:** 2 (architecture pivot)

> **Revision 2 — architecture pivot.** The digital security deposit is removed: **FR-ID-05 no longer exists** and issues **#6** and **#24** are **closed (not planned)**. Phase 1 Step 6 is re-scoped to: **multi-bike reservations** (`quantity`), a **50% down payment** (FR-INV-02), **physical collateral + asset-tag array logging** at staff check-out (FR-RNT-01), and **mock payments via `FakeGateway`**. The Backend Specialist and Web Frontend Developer are re-tasked accordingly; the staff collateral work goes to the Offline PWA Engineer. Two new issues are created by `apply_phase1_pivot_backlog.sh` and referenced below as **NEW-A** (backend DP + quantity core) and **NEW-B** (staff collateral checkout event); their numbers are assigned on creation.

This document binds every **remaining Phase 1 issue** to the workflow that executes it safely and to the persona that owns it. Frontend/UI work maps to the existing **`impeccable`** skill; backend/QA work maps to the skills in `SKILLS.md` (three appended for this purpose: `implement_redis_sse_stream`, `implement_transactional_outbox`, `run_playwright_e2e`).

---

## 1. Phase 1 progress — confirmed by repository scan

Implementation order is SRS §12; Phase 1 is steps 1–7.

| Step | SRS scope | Status | Grounded evidence | Remaining issue(s) |
|---|---|---|---|---|
| **1** | `packages/db`: schema, enums, RLS, triggers, partial unique index, seed §1.1; tests T-02/T-08/T-11/T-12 | **Mostly done** | `packages/db/src/schema.ts` (30 tables), migrations `0000–0003`, `0001_rls_and_guards.sql` (`app_rls`/`app_service`, owner policy, INV-6 triggers, transition index) | **#15** (seed + T-02/08/11/12) |
| **2** | Identity (FR-ID-01…03), config store, audit (FR-SEC-02), error envelope, idempotency | **Done** | `modules/identity` (otp/guards/service/routes/Better Auth), `modules/app-config`, `modules/audit`, `lib/{errors,error-handler,idempotency}.ts`; tests `identity`/`config`/`idempotency` | — |
| **3** | Inventory core: FR-INV-01, FR-INV-02, FR-PRC-01 (no promos), **FR-PAY-02, FR-PAY-03** w/ `FakeGateway`; tests T-01/T-04/T-09/T-10 | **Partial — re-scoped by pivot** | `modules/inventory/{availability,reservation-hold}.ts`, `modules/pricing/quote.ts`, `modules/payments/gateway.ts` (`FakeGateway`); `t-01-concurrency.test.ts`. **Still single-bike; no `quantity`, no DP, no `day_type`** | **NEW-A** (quantity + 50% DP core), **#16** (FR-PAY-02 webhook + FR-PAY-03 refunds; T-04/09/10) |
| **4** | FR-INV-03 jobs and sweeper; test T-03 | **Done** | `modules/jobs/{queue,sweeper}.ts` (hold expiry, no-show, escalation, reallocation) | **#17** (declare `bullmq` — build blocker) |
| **5** | Staff PWA + rental lifecycle: FR-OFF-01, FR-RNT-01…05, FR-INV-04, **FR-INV-05**, FR-SEC-01; tests T-07/T-15/T-16 | **Mostly done — re-scoped by pivot** | `modules/staff/events.ts` (all 5 event types, idempotent replay), `modules/reallocation`, `lib/voucher.ts`; `t-07`, `t-15`, `t-16` tests; `apps/staff` PWA. **`checkout` still sends a single `bikeAssetTag`; no `bikeAssetTags[]`, no `collateral`, no `balanceCollection`** | **NEW-B** (checkout `bikeAssetTags[]` + `collateral` + offline balance), **#18** (FR-INV-05 health sync) |
| **6** | Catalog + renter site: FR-CAT-01, FR-CAT-02, FR-ID-04, **~~FR-ID-05~~**, FR-REP-02, FR-NOT-01; test T-13 | **In progress** | FR-CAT-01 complete on API (`modules/catalog`) **and** web (`(renter)` app). Verification/SSE exist only as scaffolds; notifications outbox exists but is not wired | **#5, #7–#10**, **#20–#23, #25, #26**, **NEW-A**, **NEW-B** |
| **7** | Basic owner dashboard (FR-REP-01 P1) + admin console pages | **Not started** | `(owner)/dashboard/page.tsx` and `(admin)/admin/page.tsx` are `<main>` stubs | **#11–#13** |

**Conclusion:** Phase 1 is mid-way through **Step 6**, now under revision 1.1. Steps 1–5 are substantially built but carry **four carry-over gaps** (#15–#18) plus **two pivot gaps** (NEW-A, NEW-B); #16 and NEW-A are the hard blockers for Step 6's own T-13. Step 7 is untouched. Phase 2 must not begin until #5–#18, #20–#23, #25, #26 and NEW-A/NEW-B are closed and green (AGENTS.md #6 phase boundary).

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
| **#5** | FR-ID-04 Renter ID verification | Backend Specialist | `implement_zod_contract_route` + `implement_transactional_outbox` (emit `verification_result`); object-storage presign | storage seam; #8 |
| **NEW-A** | FR-INV-01/02 Multi-bike `quantity` + 50% DP (`bigint`) core, FR-PRC-01 `day_type` | Backend Specialist | `build_transactional_inventory_lock` + `calculate_integer_money` + `setup_drizzle_rls_schema` (new columns/enum) | #16 (intent seam) |
| **NEW-B** | FR-RNT-01 Check-out logs `bikeAssetTags[]` + `collateral` + offline `balanceCollection` | Offline PWA Engineer | `implement_offline_staff_event` (+ API event handler) | NEW-A, #10 |
| **#7** | FR-REP-02 SSE streams | Backend Specialist | `implement_redis_sse_stream` | #17 (`bullmq`/Redis), #16 |
| **#8** | FR-NOT-01 Notification outbox | Backend Specialist | `implement_transactional_outbox` | #17 |
| **#9** | FR-CAT-02 admin onboarding + seed | Backend Specialist | `implement_zod_contract_route` + `setup_drizzle_rls_schema` (idempotent seed, NFR-10) | #15 |
| **#10** | T-13 End-to-end multi-bike flow (Playwright) | Quality Assurance & SDET | `run_playwright_e2e` | #5, #7, #8, **#16**, **NEW-A**, **NEW-B**, #20–#22 |
| ~~#6~~ | ~~FR-ID-05 Security deposits~~ | — | **CLOSED — deposit removed in revision 1.1** | — |

### 3.2 Step 6 — renter web frontend (`apps/web`)

| Issue | Feature | Persona | Required skill / workflow | Depends on |
|---|---|---|---|---|
| **#20** | FR-ID-01 sign-in (phone OTP) UI | Web Frontend Developer | **`impeccable`** — `shape` → build → `polish`/`harden` | Step 2 API (done) |
| **#21** | FR-INV-02 multi-bike reservation & 50% DP checkout UI | Web Frontend Developer | **`impeccable`** (brief **exists**: `apps-web-src-app-renter-reservasi.md`) | #20, #23, **#16**, **NEW-A** |
| **#22** | FR-RNT-01 reservations + voucher QR (surface `quantity` / `dpIdr`) | Web Frontend Developer | **`impeccable`** (same brief) | #21 |
| **#23** | FR-ID-04 verification upload UI | Web Frontend Developer | **`impeccable`** — `shape` → build | #5, #20 |
| **#25** | FR-INV-04 at-risk reallocation UI | Web Frontend Developer | **`impeccable`** (reuses reservation detail) | #22 |
| **#26** | FR-REP-02 live availability (SSE client) | Web Frontend Developer | **`impeccable`** + consume `implement_redis_sse_stream` output | #7 |
| ~~#24~~ | ~~FR-ID-05 deposit top-up UI~~ | — | **CLOSED — deposit removed in revision 1.1** | — |

*(#19 is the TPM tracking issue for this set — no execution skill.)*

### 3.3 Step 7 — owner dashboard & admin console

| Issue | Feature | Persona | Required skill / workflow | Depends on |
|---|---|---|---|---|
| **#11** | FR-REP-01 (P1) owner dashboard summary API | Backend Specialist | `implement_zod_contract_route` + `setup_drizzle_rls_schema` (FR-ID-03 transaction context) + `calculate_integer_money` | Step 2 (done) |
| **#12** | Owner dashboard page `(owner)` | Web Frontend Developer | **`impeccable`** — **Operate** mode; **`shape`** first (no owner surface brief yet) | #11 |
| **#13** | Admin console pages `(admin)` | Web Frontend Developer | **`impeccable`** — **Operate** mode (brief **exists**: `apps-web-src-app-admin.md`) | #5, #9, #11 |

### 3.4 Phase 1 carry-over (Steps 1–5)

| Issue | Gap | Persona | Required skill / workflow | Blocks |
|---|---|---|---|---|
| **#15** | Seed script + T-02/T-08/T-11/T-12 | Lead Platform Architect + QA & SDET | `setup_drizzle_rls_schema` (idempotent seed, NFR-10) + Vitest integration suite (`apps/api/test/*.test.ts` against real Postgres, NFR-09) | #9, demos |
| **#16** | FR-PAY-02 webhook + FR-PAY-03 refunds, **incl. 50% DP confirmation** | Backend Specialist | `implement_zod_contract_route` + `implement_transactional_outbox` + `calculate_integer_money` | #10, **NEW-A**, #21 |
| **#17** | `bullmq` undeclared dependency | Lead Platform Architect | Dependency/workspace fix + NFR-09 CI gate | #7, #8 |
| **#18** | FR-INV-05 health sync + drift check | Backend Specialist | `implement_zod_contract_route` + `implement_transactional_outbox` (`drift_alert`) | staff app |

---

## 4. Frontend mapping detail (`impeccable`)

Every UI issue above executes through the same strict path — no direct hand-editing of surfaces outside it:

1. **`shape <route>`** — task discovery + direction. For #12 (owner) and #23 (gate) no brief exists yet → `shape` writes the surface brief first. #21/#22/#13 already have committed briefs.
2. **Build** — follow the surface brief; **Operate** mode for the reservation path, dashboards and admin (scanability, honest state), **Persuade** only where a surface is marketing.
3. **`polish` / `harden` / `audit`** — before done: error + empty + loading states, 360 px mobile floor, touch targets ≥ 44 px, WCAG 2.1 AA, `prefers-reduced-motion` (NFR-07).

**Invariants the UI must never violate** (enforced in the `run_playwright_e2e` spec, NEG-2/NEG-4): no bike ids or asset tags rendered anywhere; no coordinates sent by the client; no renter-side cancel/end/relocate-rental control (NEG-3/NEG-8). The reservation surface shows **`quantity`** and the **`dpIdr` / offline balance split** — and there is **no deposit top-up surface**.

---

## 5. Execution rules

- One skill invocation per issue; a PR may not mix a backend skill and a frontend skill without both being listed here.
- A frontend issue whose backend dependency is unmerged (#21 on #16/NEW-A, #23 on #5, #26 on #7) builds against a contract-first mock only; it does not mark the backend issue done.
- Every PR passes the NFR-09 gates (lint, `tsc --noEmit`, Vitest against real Postgres, T-01, coverage ≥ 90% on inventory/ledger/pricing). T-13 (`run_playwright_e2e`) gates Step 6.
- **Revision 1.1:** money is integer rupiah (`bigint`) everywhere (INV-5); the DP must be computed with `calculate_integer_money`/`roundHalfUp`, never floats. No PR may reintroduce a security deposit, a `deposits`/`deposit_claims` table, or `DEPOSIT_REQUIRED`.
- Phase 2 (ledger, commission, promotions, statements, payouts, disputes) starts only when **#5–#18, #20–#23, #25, #26 and NEW-A/NEW-B are closed and green** — the Phase-1 exit criteria (AGENTS.md #6).

*Generated by the Technical Project Manager persona. Acceptance Criteria for each issue live in the issue bodies; this map governs how they are executed. Reconciliation commands: `apply_phase1_pivot_backlog.sh`.*
