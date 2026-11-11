# Roadmap Audit Report — Jambi Bike Rental Platform

**Run:** weekly `opencode-roadmap-audit` · 2026-11-11 · **Persona:** Technical Project Manager (AGENTS.md #6)
**Sources:** `gh issue list` (11 open, 0 open PRs at run time), `SRS_Jambi_Bike_Rental_Platform.md` §12 (line 807) and §11.5 (line 801), `ISSUE_SKILL_MAP.md` (Rev 6 note dated 2026-11-09), `docs/phase1_step5_step7_plan.md`, repository scan.

---

## 1. Open issues and PRs (raw state)

**Open PRs: none.** (`gh pr list --state open` returned empty at run time.)

**Open issues (11):**

| # | Title (abridged) | Labels | Created | Step (SRS §12) |
|---|---|---|---|---|
| #44 | Roadmap Audit Tracker — weekly TPM status reports | Technical Project Manager | 2026-11-11 | n/a (tracker) |
| #43 | test: T-07/T-13/T-15/T-16 remainder + staff/admin Playwright specs (plan D) | Quality Assurance & SDET | 2026-11-10 | Steps 5/6/7 QA gate |
| #42 | chore(seed): per-phone cap, staff/owner/admin users, pricing defaults (plan C.4) | Backend Specialist | 2026-11-10 | Steps 1–3 seed remainder |
| #41 | feat(api): staff/admin/owner route wiring + SSE streams (plan C.2) | Backend Specialist | 2026-11-10 | Steps 5/6/7 backend wiring |
| #40 | feat(contracts): staff + admin + owner + sse Zod schemas (plan C.1) | Backend Specialist | 2026-11-10 | Steps 2/5/7 contracts |
| #39 | feat(staff): photo presigned upload (plan A.5) | Offline PWA Engineer | 2026-11-10 | Step 5 |
| #38 | feat(staff): checkout/checkin/inspection/status/incident views (plan A.4) | Offline PWA Engineer | 2026-11-10 | Step 5 |
| #37 | feat(staff): voucher offline pre-check (EdDSA + tag HMAC) (plan A.3) | Offline PWA Engineer | 2026-11-10 | Step 5 |
| #36 | feat(staff): Dexie queue capacity guard + sync status UI (plan A.2) | Offline PWA Engineer | 2026-11-10 | Step 5 |
| #35 | feat(staff): offline-first PWA shell + Workbox precache (plan A.1) | Offline PWA Engineer | 2026-11-10 | Step 5 |
| #13 | [Step 7] Admin console pages (apps/web (admin)) | Web Frontend Developer | 2026-11-05 | Step 7 |

**Closed since the last audit (issue state, `gh issue list --state closed`):** #31 (2026-11-06), #21/#22/#25/#26 (2026-11-07), #19/#10/#32/#20/#33 (2026-11-08), #12 and #14 (2026-11-10). The renter-web Step-6 set (#20–#22, #25, #26), T-13 (#10), the backend gap #31 and the owner dashboard #12 are all **closed COMPLETED**. Issue #14 (Phase 1 Progress Review) is the parent that spawned the plan A/C/D backlog #35–#43.

---

## 2. Progress per Phase 1 step (SRS §12, lines 807–816)

| Step | Scope (SRS §12) | Status | Evidence |
|---|---|---|---|
| **1** | `packages/db` schema, RLS, triggers, seed; T-02/T-08/T-11/T-12 | **Done** | #15 closed 2026-11-06; `packages/db/src/schema.ts`, migration `0001_rls_and_guards.sql` (per ISSUE_SKILL_MAP.md §1 table). Remainder: #42 adds §4 config/user/pricing seed rows |
| **2** | Identity, config store, audit, error envelope, idempotency | **Done** | #29 closed 2026-11-06 (guest checkout, NEW-C; PR #30 per ISSUE_SKILL_MAP.md §3.1). Remainder: #40 (staff/admin/owner/SSE schemas in `packages/contracts/src/` — today only `catalog.ts`, `errors.ts`, `reservations.ts`, `validation.ts` exist) |
| **3** | Inventory core: FR-INV-01/02, FR-PRC-01, FR-PAY-02/03; T-01/T-04/T-09/T-10 | **Done** | #27 (multi-bike + 50% DP) and #16 (webhook + refunds) closed 2026-11-06; #31 (quote/list/voucher routes) closed 2026-11-06; T-01 concurrency closed with Step 3 (#14 §2 table) |
| **4** | FR-INV-03 jobs + sweeper; T-03 | **Done** | #17 (bullmq dependency) and #18 (health sync) closed 2026-11-06; `modules/jobs/{queue,sweeper}.ts` (ISSUE_SKILL_MAP.md §1) |
| **5** | Staff PWA + rental lifecycle; T-07/T-15/T-16 | **Substantially done — remainder reopened by #14** | Backend green: #28 closed, `modules/staff/events.ts`, `t-07`/`t-15`/`t-16` tests (ISSUE_SKILL_MAP.md §1). PWA is still scaffold: `apps/staff/src/{db,sync,views/panels.tsx}` only — plan A.1–A.5 = #35–#39; #40 C.1.1 and #41 C.2.2/C.2.3 carry its contracts/routes |
| **6** | Catalog + renter site; T-13 | **Done** | #20 (sign-in), #21 (checkout UI), #22 (voucher QR), #25 (at-risk UI), #26 (SSE client), #31 (backend), #10 (T-13) all closed 2026-11-06→11-08. SSE *stream* emit wiring remainder absorbed into #41 C.2.7 |
| **7** | Owner dashboard + admin console | **In progress — 1 of 3 open** | #11 (summary API) closed 2026-11-06; #12 (owner page) closed 2026-11-10; #13 (admin console) open ��� `apps/web/src/app/(admin)/admin/page.tsx` verified still a `<main>` stub |

**Phase position:** the 12-step order has Step 6 fully closed and Step 7 at its last page-set (#13), but #14's review correctly re-opened Step-5 staff-app hardening (#35–#39) that the earlier "Done — re-scoped" verdict (ISSUE_SKILL_MAP.md §1, Step 5) glossed over. **Phase 2 must not start** until #13 and #35–#43 are closed and green (AGENTS.md #6 phase boundary; ISSUE_SKILL_MAP.md §5 exit list — now reduced to #13 plus the plan A/C/D set).

---

## 3. Critical path and blocked items

**Critical path (dependency chain, grounded in issue bodies):**

```
#40 (contracts C.1) ──► #41 (routes C.2) ──► #38 (staff views A.4)
        │                     │
        │                     └────► #13 (admin console, needs C.2.4 admin routes)
        ├──────────────────────────► #35–#37 (staff shell/queue/voucher need C.1.1 schemas)
        └──────────────────────────► #39 (photo upload needs C.1.1 uploadUrlSchema)
#42 (seed C.4) — parallel, unblocks realistic users for #13/#35 testing
#43 (QA plan D) ── depends on #35–#39 AND #13 ──► PHASE 1 EXIT
```

- **#40 is the root blocker.** Its body states it "unblocks #35–#38 (staff), #13 (admin console), #11/#12 (owner)" — and `packages/contracts/src/` confirms the staff/admin/owner/SSE schema files do not exist yet.
- **#41 is the second blocker:** #38's read endpoints (`/staff/outlet/bikes|expected|overdue`) are "Not present today — verified by grep" per #41; #13 B.2 needs the admin routes of #41 C.2.4.
- **#43 is the exit gate:** depends on "#35–#39 (staff PWA + contracts) and #13 (admin console)" (#43 Notes).
- **No issue is hard-blocked today** — #42 only requires #9's seed to have landed (it closed 2026-11-06) — but every staff/admin item is *sequenced behind* #40/#41.

---

## 4. Stalled issues and unblocking proposals

No open issue has had zero activity long enough to be truly stalled (the plan A/C/D set is 1 day old), but four items carry stall risk with concrete unblockers:

1. **#37 (voucher offline pre-check) — decision flag, highest risk.** Its Notes record a format conflict: SRS FR-SEC-01.1 specifies a compact EdDSA JWT with `kid`, while `apps/api/src/lib/voucher.ts` line 7 ships an HMAC `v1.` wire format (verified in this scan). **Unblock:** Backend Specialist converges the server to EdDSA/JWKS before #37 merges, or the Lead Platform Architect files an SRS amendment for HMAC — either way the TPM must record the decision. Keys stay in env secrets (FR-SEC-01.4).
2. **#39 (photo presigned upload) — missing dependency.** It "depends on object storage wiring (S3-compatible, private bucket)" but **no issue tracks that infrastructure**. **Unblock:** file a dedicated storage-provisioning issue (dev: MinIO/presign stub; prod: private bucket config) before #39 is picked up.
3. **#13 (admin console) — oldest open issue (created 2026-11-05), sat blocked for 5 days** on backend routes that only now exist as #40/#41 scope. **Unblock:** keep it sequenced after #40→#41; start B.1 (shell + admin sign-in, which depends only on closed Step-2 identity work) immediately in parallel.
4. **`ISSUE_SKILL_MAP.md` — stale and no longer maps any open issue.** See §6.

---

## 5. Unresolved SRS §11.5 TBD decisions blocking launch

SRS §11.5 (line 801) lists decisions still owed by the business, implemented as config (§4 TBD rows):

| Decision (§11.5 / §4 key) | Seed/FIXTURE value | Blocks |
|---|---|---|
| Rental rates + billing unit (`pricing_rules`, `pricing.billing_unit_minutes`) | weekday/weekend tiers per §4, unit 60 min | Real pricing; T-10 must pass with any value (SRS §4 note) |
| Booking window limits (`booking.slot_minutes`, `min/max_duration_minutes`, `max_advance_days`, `min_lead_minutes`) | 15 / 60–1440 / 7 / 0 | FR-INV-02.3 pre-validation defaults |
| Max quantity + per-phone cap (`booking.max_quantity`, `booking.max_active_reservations_per_phone`) | 5 / 3 (A-19) | Guest-checkout anti-spam backstop — seeded only by #42 |
| Late fee + grace + escalation (`late.grace_minutes`, `late.fee_per_30min_idr`, `late.escalation_minutes`, `late.collection_method`) | 15 min / Rp 20,000 / staged / `payment_intent` | FR-RNT-04 behavior surfaced in #38 A.4.2/A.4.6 |
| Down-payment rate (`booking.dp_rate_bps`) | 50% (§4 marks it FIXED; §11.5 still lists it as owed) | FR-INV-02.4 |
| Lost-unit penalty (`penalty.lost_unit_idr`), claims split (`claims.owner_share_bps`) | Rp 4,000,000 / 10000 | Offline settlement UX (#38 A.4.3) |
| QR token lifetime (`qr.voucher_ttl_seconds`) | 60 s | #37 voucher expiry pre-check |
| Other §4 TBDs: `checkout.early_minutes`, `payments.min_charge_idr`, `noshow.refund_policy`, `condition.min/max_photos`, `reallocation.response_minutes`, `reports.repeat_fault_threshold`, `holidays` | per §4 | Config completeness |

**Status:** none of these is owned by any open issue — #13 B.3.1 only *surfaces* them via the config editor; #42 seeds only the per-phone cap, pricing defaults and commission rule. **Launch risk:** business must sign off every §11.5 value before production (they are safe as fixtures for Phase 1 demos). Also outstanding for launch, per SRS §11.1: **G-03 legal review** of renter contact-data handling (no ID images since rev 1.2) — no issue tracks it. G-01 (Xendit) is **not** a Phase-1 blocker (§2: P1 uses `FakeGateway` exclusively); G-02 (Better Auth capability check) should be confirmed in #35 A.1.4.

---

## 6. ISSUE_SKILL_MAP.md staleness — exactly what moved

`ISSUE_SKILL_MAP.md` (header line 5: "Revision: 5 … #21/#22 awaiting merge", branch `feature/fr-inv-02-renter-booking`, dated 2026-11-07, with a Rev 6 note dated 2026-11-09) is stale versus reality in these specific ways:

1. **Header meta not bumped:** line 5 still says "Revision: 5 … #21/#22 awaiting merge", but #21/#22 closed 2026-11-07 and the body contains the Revision 6 note — the header was never updated to 6.
2. **§1 Step-6 row** lists remaining "#10, #20, #25, #26" — all four closed (2026-11-07/08); Step 6 status "In progress" is now **Done**.
3. **§1 Step-7 row** says "pages not started", remaining "#12, #13" — #12 (owner dashboard page) closed 2026-11-10; only #13 remains.
4. **§1 conclusion / §5 exit criteria** ("Phase 2 must not begin until #10, #12, #13, #20–#22, #25, #26 are closed") — all of those are closed except #13, and the exit list must now also include **#35–#43**.
5. **§3.2 note** "#19 is the TPM tracking issue for this set" — #19 closed 2026-11-08; the tracker is now **#44** (created 2026-11-11).
6. **§3.1** calls #31 "the only remaining backend issue" and #22 "blocked by #31" — #31 closed 2026-11-06; the backend set is now #40/#41/#42.
7. **Zero coverage of the 11 open issues:** the map has no entries for #35–#43 (plan A/C/D, created from #14 on 2026-11-10), #44 (tracker), or #32 (dev-DB isolation, closed 2026-11-08, now cited by #42/#43 as a standing constraint).
8. **Branch reference moved:** the map cites `feature/fr-inv-02-renter-booking`; the operative plan of record is now `docs/phase1_step5_step7_plan.md` §A/§C/§D (cited by every one of #35–#43), reviewed on `staging` per #14.

**Recommendation (report-only):** regenerate ISSUE_SKILL_MAP.md as Revision 7 binding #35–#43 to personas/skills (`implement_offline_staff_event`, `implement_zod_contract_route`, `run_playwright_e2e`, `impeccable`) before the next audit.

---

## 7. Bottom line

- **Phase 1 is ~90% done by issue count:** Steps 1–6 fully closed (#15/#29/#27/#31/#16/#17/#18/#28/#20/#21/#22/#25/#26/#10/#11/#12), with Step 5 staff-PWA hardening (#35–#39) and the admin console (#13) as the last build items, and #43 as the QA exit gate.
- **Critical path:** #40 → #41 → {#13, #38} → #43. Resolve the #37 voucher-format decision and file the #39 storage dependency this week.
- **Launch blockers beyond code:** SRS §11.5 TBD sign-off (no owner assigned) and gate G-03 legal review (untracked).
- Phase 2 remains correctly locked per the AGENTS.md #6 phase boundary until the above close green.
