# Roadmap Audit Report — Jambi Bike Rental Platform

**Run:** weekly `opencode-roadmap-audit` · 2026-11-16 · **Persona:** Technical Project Manager (AGENTS.md #6)
**Sources:** `gh issue list` (2 open issues, 0 open PRs at run time), `gh pr list` (0 open, 33 total incl. 31 merged), `SRS_Jambi_Bike_Rental_Platform.md` v1.3 §12 (line 807) and §11.5 (line 801), `ISSUE_SKILL_MAP.md`, `docs/phase1_step5_step7_plan.md`, repository scan.

---

## 1. Open issues and PRs (raw state)

**Open PRs: none.** (`gh pr list --state open` returned empty at run time.)

**Open issues (2):**

| # | Title (abridged) | Labels | Step (SRS §12) |
|---|---|---|---|
| #44 | Roadmap Audit Tracker — weekly TPM status reports | Technical Project Manager | n/a (tracker) |
| #43 | test: T-07/T-13/T-15/T-16 remainder + staff/admin Playwright specs (plan D) | Quality Assurance & SDET | Steps 5/6/7 QA gate |

**Closed since the 2026-11-11 audit:** #64 (admin owners list GET, merged via PR #65) and #43's sub-items landed via PRs #68–#72 (T-14 PRs A–D), #74/#75 (offline round-trip spec + dev seed endpoints), #70 (ISSUE_SKILL_MAP pointer conversion). #43 itself remains open on 3 blockers.

---

## 2. Progress per Phase 1 step (SRS §12)

| Step | Scope (SRS §12) | Status | Evidence |
|---|---|---|---|
| **1** | `packages/db` schema, RLS, triggers, seed; T-02/T-08/T-11/T-12 | **Done** | #15 closed 2026-11-06; seed remainder #42 closed (PR #49); `packages/db/src/schema.ts`, `migrations/0001_rls_and_guards.sql` |
| **2** | Identity, config store, audit, error envelope, idempotency | **Done** | #29 closed (PR #30, guest checkout NEW-C); contracts #40 (PR #46); routes #41 (PR #47) |
| **3** | Inventory core: FR-INV-01/02, FR-PRC-01, FR-PAY-02/03; T-01/T-04/T-09/T-10 | **Done** | #27 (multi-bike + 50% DP, PR #27), #16 (webhook + refunds), #31 (quote/list/voucher), #34 (quantity scaling, PR #34); T-01 concurrency green |
| **4** | FR-INV-03 jobs + sweeper; T-03 | **Done** | #17 (bullmq dep), #18 (health sync); `modules/jobs/{queue,sweeper}.ts` |
| **5** | Staff PWA + rental lifecycle; T-07/T-15/T-16 | **Done** (QA remainder in #43) | Plan A landed: #35 (PR #59), #36 (PR #48), #37 (PR #51), #38 (PR #52), #39 (PR #56); backend #40/#41/#42; `apps/staff/src/{db,sync,views}` |
| **6** | Catalog + renter site; T-13 | **Done** | #6–#10 closed; renter web #20–#22/#25/#26 closed; SSE #7 (PR #7), notifications #8; T-13 #10 closed |
| **7** | Owner dashboard (FR-REP-01 P1) + admin console | **Done** | #11/#12/#13 closed; admin console PR #60; owner GET follow-up #64 (PR #65); `apps/web/src/app/(admin)` and `(owner)` route groups |

**Phase 1 is functionally complete; the only open Phase-1 item is the QA gate #43.** Phase 2 (steps 8–10) has not started — blocked by the Phase boundary rule in `ISSUE_SKILL_MAP.md` §Execution rule 6 until #43 closes and gates are green.

---

## 3. Critical path and blocked items

- **Critical path:** #43 (QA gate) → Phase 2 kickoff (steps 8–10: ledger, commission, promotions, statements, payouts, disputes, reports).
- **Blocked items:** #43 itself; its 3 blockers are listed in its body (offline round-trip, coverage gate, T-14 breadth). No other open issues.
- **Tracker:** #44 (this audit) is managed by automation; not a blocker.

---

## 4. Stalled issues and unblocking proposals

**#43** (open since 2026-11-10; partial progress via PRs #68–#72, #74, #75; 3 blockers remain):

1. **Offline round-trip (D.5 full).** "Queue 3 events offline → reconnect → applied" needs service worker + live API + staff session; staff auth is cookie-based and the PWA's bearer-token path is not wired. *Proposal:* split into a dedicated issue assigned to Offline PWA Engineer (#pwa-engineer) + QA; reuse the dev seed endpoints from PR #75 and the Playwright harness already added in `apps/staff`; wire a staff session cookie in the test setup rather than mocking IndexedDB. Accept the capacity spec (#74) as the interim offline coverage.
2. **Coverage gate (D.8).** No vitest coverage config exists (`apps/api/vitest.config.ts` has no `coverage` block). *Proposal:* add a `coverage` block with v8 provider and `thresholds` (90% on `modules/inventory`, `modules/ledger`, `modules/pricing`); add to CI; assign Backend Specialist (#backend) to fix any shortfalls.
3. **T-14 breadth.** Boundary tests cover admin owner/outlet/bikes + staff checkout only; owner/renter/config/pricing-rules schemas remain. *Proposal:* continue the PR-A/B/C/D split pattern (PRs #68–#72) with one PR per schema group; assign QA (#qa). NFR-11 requires every route schema covered.

---

## 5. Unresolved SRS §11.5 TBD decisions blocking launch

Per `SRS_Jambi_Bike_Rental_Platform.md` §11.5 (line 801) and §4 seeds (illustrative mock data):

- Rental rates and billing unit, including weekday/weekend tiers
- Booking window limits
- Late-fee rate and grace period
- Escalation timings
- Down-payment rate (`booking.dp_rate_bps`, seed 50%)
- Lost-unit penalty
- Maximum active reservations per phone (`booking.max_active_reservations_per_phone`, seed 3)
- QR token lifetime

These are implemented as config (admin `PATCH /admin/config`, pricing rules) but no business decision has been recorded; owners/admin may change every amount, but seeds must be finalized before launch. *No open issue tracks finalization — recommend filing a single owner/admin decision issue or resolving via the admin config editor (plan B.3.1) before Phase 3.* Additionally, Phase 3's `feature.sister_outlets_enabled` flag (SRS §12 step 11, A-11) remains disabled pending a revisit of A-11.

---

## 6. ISSUE_SKILL_MAP.md staleness check

`ISSUE_SKILL_MAP.md` is a thin pointer (27 lines) deferring per-issue state to `gh issue list` and this report. **No stale claims detected** — it correctly references §12/§11.5, the plan doc, and the persona→agent label routing. One observed reality not enumerated in the plan's A–G checklist: the admin owners list endpoint gap (#64) surfaced during #43's D.6 and was merged via PR #65; no map edit required. No corrections needed this run.
