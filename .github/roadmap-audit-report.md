# Roadmap Audit Report — Jambi Bike Rental Platform

**Run:** weekly `opencode-roadmap-audit` · 2026-11-23 · **Persona:** Technical Project Manager (AGENTS.md #6)
**Sources:** `gh issue list` (8 open issues), `gh pr list` (1 open PR, #95), `SRS_Jambi_Bike_Rental_Platform.md` v1.3 §12 (line 807) and §11.5 (line 801), `ISSUE_SKILL_MAP.md`, `docs/phase1_step5_step7_plan.md`, repository scan (`staging` HEAD `cdc2adf`, merge of PR #93).

---

## 1. Open issues and PRs (raw state)

**Open PRs (1):**

| # | Title | Base | Head | Notes |
|---|---|---|---|---|
| #95 | Done. | **main** | `opencode/issue85-20261117210023` | Closes #85; 15 files touching `apps/api/src/modules/ledger/*`, schema migration `0009`, `vitest.config.ts`, payments webhook, notifications outbox, t-14b/c tests. **Targets `main` directly — violates AGENTS.md §8 (issue-fix PRs must target `staging`); `main` is promotion-only.** |

**Open issues (8):**

| # | Title (abridged) | Labels | Step (SRS §12) |
|---|---|---|---|
| #44 | Roadmap Audit Tracker — weekly TPM status reports | Technical Project Manager | n/a (tracker) |
| #85 | [Step 8] Backend · FR-LED-01/FR-LED-02 · Ledger posting + commission rules | Backend Specialist | 8 |
| #86 | [Step 8] Backend · FR-PRC-01.3 · Promotions engine | Backend Specialist | 8 |
| #87 | [Step 9] Backend · FR-LED-03/FR-LED-04 · Weekly statements + Tuesday payouts (T-06) | Backend Specialist | 9 |
| #88 | [Step 9] Backend · FR-LED-05 · Dispute workflow | Backend Specialist | 9 |
| #89 | [Step 8/9] QA · Phase 2 plan E — T-05/T-06, ledger invariant, coverage gate | Quality Assurance & SDET | 8/9 |
| #90 | [TBD] TPM · Business sign-off of SRS §4 config decisions before launch | Technical Project Manager | launch gate |
| #91 | [Housekeeping] TPM · Harden `opencode-roadmap-audit.yml` — read-only agent | Technical Project Manager | n/a (CI) |

**Closed since the 2026-11-16 audit:** #43 (QA gate) closed 2026-11-17 via PR #77 (D.8 coverage gate + time-of-day-safe test windows); #66 and #67 closed earlier via PRs #75/#68–#72. Phase 1 is now fully complete.

---

## 2. Progress per Phase 1 step (SRS §12)

| Step | Scope (SRS §12) | Status | Evidence |
|---|---|---|---|
| **1** | `packages/db` schema, RLS, triggers, seed; T-02/T-08/T-11/T-12 | **Done** | #15 closed (PR #15); seed remainder #42 closed (PR #49); `packages/db/src/schema.ts`, `migrations/0001_rls_and_guards.sql` |
| **2** | Identity, config store, audit, error envelope, idempotency | **Done** | #29 closed (PR #30); contracts #40 (PR #46); routes #41 (PR #47) |
| **3** | Inventory core: FR-INV-01/02, FR-PRC-01, FR-PAY-02/03; T-01/T-04/T-09/T-10 | **Done** | #27 (multi-bike + 50% DP, PR #27), #16 (webhook + refunds), #31 (quote/list/voucher), #34 (quantity scaling, PR #34); T-01 concurrency green |
| **4** | FR-INV-03 jobs + sweeper; T-03 | **Done** | #17 (bullmq dep), #18 (health sync); `modules/jobs/{queue,sweeper}.ts` |
| **5** | Staff PWA + rental lifecycle; T-07/T-15/T-16 | **Done** | Plan A landed: #35 (PR #59), #36 (PR #48), #37 (PR #51), #38 (PR #52), #39 (PR #56); backend #40/#41/#42; `apps/staff/src/{db,sync,views}` |
| **6** | Catalog + renter site; T-13 | **Done** | #6–#10 closed; renter web #20–#22/#25/#26 closed; SSE #7 (PR #7), notifications #8; T-13 #10 closed |
| **7** | Owner dashboard (FR-REP-01 P1) + admin console | **Done** | #11/#12/#13 closed; admin console PR #60; owner GET follow-up #64 (PR #65); `apps/web/src/app/(admin)` and `(owner)` route groups |

**Phase 1 is complete.** The last open Phase-1 item (#43) closed 2026-11-17 via PR #77, satisfying `ISSUE_SKILL_MAP.md` Execution rule 6 (Phase 2 starts only when every open Phase-1 issue is closed). Phase 2 has begun: #85 has an implementation PR (#95) awaiting review/merge.

---

## 3. Phase 2 progress (steps 8–10, SRS §12)

| Step | Scope | Status | Evidence |
|---|---|---|---|
| **8** | Ledger, commission rules, promotions (FR-LED-01/02, FR-PRC-01 promos); T-05 | **In progress** | #85 (open) has PR #95 (open, 15 files) implementing `modules/ledger/*`, schema migration `0009`, money helpers; #86 (open) not started; #89 E.1–E.4 can start now |
| **9** | Statements, payouts, disputes (FR-LED-03–05); T-06 | **Blocked** | #87 blocked by #85; #88 blocked by #87; #89 E.5–E.7 blocked by #87 |
| **10** | Reports (FR-REP-01 P2) | **Not started** | No issue filed yet |
| launch | Business config sign-off (§4/§11.5) | **Tracking** | #90 (open, no code) |
| CI | Audit workflow hardening | **Open** | #91 (open); relates to the PR #76/#95 agent-write incidents |

---

## 4. Critical path and blocked items

- **Critical path:** PR #95 (retarget to `staging` + review/merge) → close #85 → unblocks #86 (promotions), #87 (statements/payouts), #89 E.1–E.4 → then #88 (disputes) and #89 E.5–E.7 → Phase 2 QA gate → step 10 (reports) → launch gates (#90 TBD sign-off, G-03 legal review, §12 step 11 sister-outlets flag).
- **Blocked items:**
  - #86 blocked by #85 (needs promo snapshot fields the ledger consumes) — can be built in parallel with a shared contracts PR per #86 notes.
  - #87 blocked by #85 (`ledger_entries` + posting); additionally gate G-01 (Xendit Disbursement API enabled) must be confirmed before merge (#87 scope).
  - #88 blocked by #87 (`payouts.paid_at`).
  - #89 E.5–E.7 blocked by #87; E.1–E.4 unblocked.
- **Convention risk:** PR #95 targets `main` directly, violating AGENTS.md §8 and the very guardrail #91 proposes. It also bundles unrelated changes (t-14b/c test files, payments webhook routes, notifications outbox) into a ledger PR. This is the same class of incident as PR #76, which #91 was filed to prevent.

---

## 5. Stalled issues and unblocking proposals

- **#85** (open since 2026-11-17): has an implementation in PR #95 but it is unmerged and mis-targeted.
  *Proposal:* retarget PR #95 to `staging` (`gh pr edit 95 --base staging`), split the unrelated t-14b/c, payments-webhook, and outbox changes into separate PRs, then review against NFR-09 (lint, `tsc --noEmit`, Vitest on `kayooh_test`, ≥90% coverage on `modules/ledger`). Assign Backend Specialist.
- **#86** (open, no PR): promotions engine replacing the `PROMO_INVALID` placeholder in `apps/api/src/modules/pricing/quote.ts`.
  *Proposal:* start after #85 merges (or via a shared contracts PR); include the `promo_redemptions` table flag for architect review per #86 scope. Assign Backend Specialist.
- **#87** (open, blocked): statements/payouts.
  *Proposal:* confirm gate G-01 (Xendit Disbursement API) before the PR merges; reuse Phase 1 bullmq/outbox infra (SRS §8). Assign Backend Specialist.
- **#88** (open, blocked): disputes.
  *Proposal:* queue after #87; admin disputes queue UI (§7.4/B.4.3) can be a separate Web Frontend issue if desired. Assign Backend Specialist.
- **#89** (open): QA plan E.
  *Proposal:* start E.1–E.4 (T-05 table-driven ledger cases, double-entry invariant, INV-5 integer-money audit, coverage gate extension in `apps/api/vitest.config.ts`) now against #85; defer E.5–E.7 until #87. Assign QA.
- **#90** (open, no code): business sign-off tracker.
  *Proposal:* no code; drive sign-offs via this issue's checklist; `noshow.refund_policy` and `late.collection_method` must be signed off before the #87 payouts PR merges (they change money flows). Assign TPM / business owner.
- **#91** (open): audit workflow hardening.
  *Proposal:* implement the read-only contract (`persist-credentials: false`, no `contents: write`, no repo-scoped secrets, HEAD-sha guard, documented contract) so the next two scheduled runs produce only a #44 comment + Summary tab with zero mutations. Assign TPM; this very run is the test case.

---

## 6. Unresolved SRS §11.5 TBD decisions blocking launch

Per `SRS_Jambi_Bike_Rental_Platform.md` §11.5 (line 801) and §4 seeds (illustrative mock data); tracked in #90:

- Rental rates and billing unit, including weekday/weekend tiers (`pricing_rules`, `pricing.billing_unit_minutes`, FIXTURE 60)
- Booking window limits (`booking.slot_minutes` 15, `min/max_duration_minutes` 60/1440, `max_advance_days`/`min_lead_minutes` 7/0, `booking.max_quantity` 5, `booking.max_active_reservations_per_phone` 3)
- Late-fee rate and grace (`late.fee_per_30min_idr` FIXTURE 20000, `late.grace_minutes` FIXTURE 15, `late.escalation_minutes`, `late.collection_method` `payment_intent` vs `offline_cash`)
- Escalation timings (`reallocation.response_minutes` 30)
- Down-payment rate (`booking.dp_rate_bps`, seed 50% — A-12)
- Lost-unit penalty (`penalty.lost_unit_idr` FIXTURE 4000000, `claims.owner_share_bps` FIXTURE 10000)
- Maximum active reservations per phone (seed 3, A-19)
- QR token lifetime (`qr.voucher_ttl_seconds` 60)
- Remaining TBDs: `payments.min_charge_idr` 10000, `condition.min/max_photos` 1/8, `reports.repeat_fault_threshold/window_days` 3/90, `holidays` list, seed outlet lat/lng/hours
- Highest-risk: `noshow.refund_policy` (`full_refund` vs `retain_full`, FIXTURE `full_refund`, A-03) — determines whether paid DP is forfeited on no-show

Also a launch gate not in §11.5: G-03 legal review of renter personal data (§11.1), and Phase 3's `feature.sister_outlets_enabled` flag (§12 step 11, A-11) remains disabled. No business value may be hard-coded; seeds stay FIXTURE-labelled (SRS §4, T-10).

---

## 7. ISSUE_SKILL_MAP.md staleness check

`ISSUE_SKILL_MAP.md` is a thin pointer (per its own header). **No stale claims detected.** Observed reality that moved since the last audit:

- Phase 1 exit condition now satisfied: #43 closed 2026-11-17 (PR #77), so the pointer's rule 6 (Phase 2 starts only when all Phase-1 issues are closed) is now true; Phase 2 (steps 8–9) has legitimately started via #85/#86/#87/#88.
- A new payment gateway landed: PR #93 (`feature/kasera-payment-gateway`) merged to `staging` 2026-11-17 — this is additive to the Xendit adapter called out in #87's G-01 gate; confirm it does not silently substitute Xendit disbursement (AGENTS.md #2 directive: gateways behind the `PaymentGateway` interface).
- PR #95 (agent-authored, targets `main`) repeats the PR #76 incident that #91 was filed to prevent — the pointer does not enumerate this, but #91 now captures it. Recommend the workflow hardening land before the next scheduled run.

No corrections required to `ISSUE_SKILL_MAP.md` itself.