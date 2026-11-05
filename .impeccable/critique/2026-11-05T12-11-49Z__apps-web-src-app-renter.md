---
target: renter route group
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/Users/user/Projects/kayooh/apps/web/src/app/(renter)"
timestamp: 2026-11-05T12-11-49Z
slug: apps-web-src-app-renter
---
# Design Critique — Kayooh Renter (Poster Solidaritas)

**Method: dual-agent (A: ses_e5475ba4effeeyuU3zxyRVzN0u · B: ses_e54692cacffeE12Z0217uPhCg4)**

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live counts; index lacks freshness (“dihitung … WIB”) |
| 2 | Match System / Real World | 3 | Jambi/WIB/language exact; failure leak uses browser-English |
| 3 | User Control and Freedom | 4 | Toggles, refresh, URL carry; filter not URL-synced |
| 4 | Consistency and Standards | 3 | World coherent; home no h1; /outlets h1→h3 |
| 5 | Error Prevention | 3 | Param validation; raw `.message` escapes recovery copy |
| 6 | Recognition Rather Than Recall | 4 | Choices echoed in kicker / Jendela; counts-only model |
| 7 | Flexibility and Efficiency of Use | 2 | /outlets filter is not accelerated; no URL feedback |
| 8 | Aesthetic and Minimalist Design | 4 | Focused; minor redundancy (nama strip / repeating truth line) |
| 9 | Error Recovery | 2 | Actions present; diagnosis fails on network failure |
| 10 | Help and Documentation | 2 | kaki only; no QR/deposit/e-KTP guidance |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict

~80% unmistakably Kayooh. The honesty mechanism (server figures, fail-fast, no fabrications), the 4-column ruled COM/ROD/MTB/FIX count grid, NEG-2 guarantee (no bike IDs), and trust contract are authored. The remaining ~20% is a cleanly-thin live inventory catalog; with all-zero demo columns it can still read as a generic zero table on first contact.

Deterministic scan: 0 non-advisory findings. 18 advisory font-size findings, all in `renter.css`; each flagged value is documented in the same DESIGN.md prose and only disagrees with the frontmatter ramp. Live browser review reports 43 / occurrences (/) and 31 (/outlets); ~15 entries/outlets repeat per card. False-positive context: 11.5 px Body and 8 px Label are explicit world steps; repeated outlet-card entries inflate counts; slogan is authored/motion-gated; `.slogan-track` is clipped.

Measured 320 px overflow: `.renter-sheet` / `main` at `left: -20px`; 360 px declared remains clean; 320 reflow (if claimed) is unmet.

## Overall Impression

A disciplined honesty-as-design interface broken at one valley: network failure displays raw browser text beside a cramped recovery action.

## What’s Working

1. Honesty architecture (server-computed inventory; no fallback fabrications).
2. Memory externalization across handoffs (kicker, Jendela, `aria-pressed`).
3. In-world empty/error/loading states (dashed / solid kertas / merah) with named recovery.

## Priority Issues

1. [P1] Raw English network error alongside crowded `COBA LAGI` — fix with Indonesian fallback, flex column notice, 44 px recovery.
2. [P2] Accessibility/landmark bundle — home h1; outlet row heading h2; double-ring visible focus; `role=`/`aria-live` for pending/empty.
3. [P2] Demo data presented as real — env-gated DATA DEMO marker until launch; check out of world.
4. [P2] No verb; critical facts smallest — restore sequence strip; one e-KTP line; promote return constraint to 11.5 px.
5. [P3] Doc/world drift & assembly — blue-as-focus exception or amendment; inline styles into classes; unify API env; font preloads.

## Persona Red Flags

- **Jordan:** trust valley (“Failed to fetch”); unrevealed deposit/QR/e-KTP facts.
- **Sam:** headless home; skipped heading; silent loading/zero-match; focus invisibility on merah; abbreviated cells not expanded.
- **Alex:** no freshness statement; filter not shareable; marquee not locally dismissible.
- **Casey:** primary refresh top-right; inline `Tampilkan semua outlet` ~18 px.

## Minor Observations

Copy argues against an absent misconception; partially open as design-pandemic: poster shell may stay bare below fold; `nama-strip` illegible/redundant; `kuri?` — check AA focusable radius timeouts; /outlets missing page title; marquee hover transform not PRM-gated; row means closed outlets untested; 320 px escape.
