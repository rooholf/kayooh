# ISSUE_SKILL_MAP — execution-path pointer (supersedes the 2026-11-07 revision)

**This is now a thin pointer, not a living table.** The per-issue state tables in the 2026-11-07 revision are obsolete and were removed: the single source of truth for *which issues are open and how they depend on each other* is the **open GitHub issue list** (with `Technical Project Manager`/persona labels from the `opencode-triage` workflow) plus the weekly **`opencode-roadmap-audit`** report (`.github/roadmap-audit-report.md`, pinned to tracker issue #44). Do not maintain a hand-edited issue-by-issue map here — it goes stale, as the SDET and TPM correctly complained on 2026-11-13.

## Where each thing lives now

| Question | Source of truth |
|---|---|
| Which issues are open / blocked / closed | `gh issue list` + persona labels (triage workflow auto-labels new issues) |
| Phase progress, critical path, stalled items | `.github/roadmap-audit-report.md` (weekly) + tracker issue #44 |
| Implementation order & phase boundary | `SRS_Jambi_Bike_Rental_Platform.md` **v1.3** §12 + §11.5 |
| Current execution plan (Staff PWA / Admin console / backend gaps) | `docs/phase1_step5_step7_plan.md` (sections A–G) |
| Skill/workflow inventory | `SKILLS.md` + the `impeccable` skill (`.opencode/skills` / `.impeccable` briefs in `apps/web`) |
| Persona → agent routing (for action runs) | Labels: `Lead Platform Architect`→`architect`, `Backend Specialist`→`backend`, `Web Frontend Developer`→`web-frontend`, `Offline PWA Engineer`→`pwa-engineer`, `Quality Assurance & SDET`→`qa`, `Technical Project Manager`→`tpm`, `UI/UX Designer`→`ui-ux` (see `.github/workflows/opencode.yml`) |

## Execution rules (still binding — carried over from the old §5)

1. **One skill invocation per issue.** A PR may not mix a backend skill and a frontend skill without both being listed for that issue.
2. **Contract-first mocks only.** A frontend issue whose backend dependency is not merged builds against mocks; it does not mark the backend issue done.
3. **NFR-09 gates on every PR** (AGENTS.md §8: all issue-fix PRs target `staging`; `main` is promotion-only): lint, `tsc --noEmit`, Vitest against real Postgres (`kayooh_test` — never the dev DB, issue #32), and the coverage floor on `modules/inventory`, `modules/ledger`, `modules/pricing`.
4. **Pivot guardrails — no PR may reintroduce:** a `verification_status` column, `verification_requests`/`id_document_views` tables, a `VerificationProvider` system, or a 422 `VERIFICATION_REQUIRED` error (SRS revision 1.2, FR-ID-04 deleted); a security deposit (`deposits`/`deposit_claims` tables, `DEPOSIT_REQUIRED` — revision 1.1, FR-ID-05 deleted); dockless logic, bike GPS, or any bike map/loose-bike tracking (NEG-1/2/3); any renter-side cancel/end/relocate of a rental (NEG-3, NEG-8). Physical collateral (KTP/SIM/vehicle) stays **offline at staff check-out** (FR-RNT-01, V-COLLATERAL) — never digital.
5. **Money is integer rupiah (`bigint`), no floats, anywhere** (INV-5, NFR-05); the 50% DP math uses `roundHalfUp(finalIdr * booking.dp_rate_bps / 10000)` via `calculate_integer_money`.
6. **Phase boundary (AGENTS.md #6):** Phase 2 (ledger, commission, promotions, statements, payouts, disputes) starts only when every open Phase-1 issue is closed and green. The exit list is *whatever `gh issue list` shows open* — never a hard-coded issue-number list in this document.

## Housekeeping

- This file exists so the `opencode-roadmap-audit` workflow and the `.opencode/agents/*` definitions have a stable reference. If it grows beyond ~80 lines, that is a smell: the extra content belongs in the weekly audit report or the plan doc, not here.
