---
version: 1
slug: "apps-web-src-app-owner"
primary_target: "apps/web/src/app/(owner)"
related_targets: []
---

# Surface brief — Owner dashboard

## Scope

`apps/web` `(owner)` route group — the **owner dashboard**, reached after the owner signs in. Today the group holds one route: `/owner/dashboard` (currently a `<main>` stub). Visitor **mode: Operate** — the visitor completes the daily oversight task and leaves. It shares the Next.js app and stack with the `(renter)` and `(admin)` groups but carries a **different shape**: it is not the campaign-poster renter surface (that world's rules explicitly do not apply here) and not the desktop admin console; it is a phone-screen conviction read.

**Device truth:** the anchored mock is a **390 × 844 phone frame**. Phone-first: minimum viewport 360 px, single column, nothing that needs a pointer. A desktop layout may exist later but is not the design target for this round.

## Audience, job, task

- **Audience:** the owner (B2B2C customer; RLS-scoped to their own fleet). Runs one staffed outlet today. Checks the screen daily, typically at 07:00, in seconds, on their phone.
- **Job:** know in one glance that the fleet is healthy and the money is accruing — then act on the one thing that needs it.
- **Primary task:** read the running earnings figure (gross, current WIB week), the per-category bike state counts (siap/tersewa/servis-class states plus held/confirmed pressure), and late/overdue open rentals.
- **Also in scope (P1):** the open-rentals list (asset tag, masked phone, checked-out time, expected end, overdue, escalation stage) and live update via `GET /owner/stream` SSE.
- **Out of scope for this round (P2):** utilization/peak-hours/average-length reports (`GET /owner/reports/*`), statements, payouts, promo opt-out, pricing override UI. The brief records their future claim on the surface; they are not built.

## Proof / content

- **API truth (implemented):** `GET /owner/dashboard/summary` (`apps/api/src/modules/owner/summary.ts`, route in `modules/owner/routes.ts`, `requireRole("owner")`) returns `{ outlets: [{ outletId, code, name, categories: [{ category, bikesByState, heldCount, confirmedCount }], openRentals: [{ bikeAssetTag, renterPhoneMasked, checkedOutAt, expectedEndAt, overdue, escalationStage }], lateReturns }], grossAccruedIdr }`. `grossAccruedIdr` is the sum of completed rentals' `price_idr` for the current WIB week (Monday-cut), before commission, labeled **gross**.
- **Held/reserved pressure comes from `reservations.quantity` summed over reservations overlapping now — never from `bikes.state`** (SRS A-05; no code path may set `held`/`reserved`).
- **Late escalation:** stages per `late.escalation_minutes` (defaults reminder 0 / staff_call 30 / owner_flag 60 / claim_eligible 240 — config defaults, subject to business decision). Escalation surfaces as stage + overdue flag, and as the `owner_late_flag` notification.
- **Money:** integer rupiah only (`bigint`, string-serialized in JSON). Never multiply, derive, or invent figures client-side; the only saldo the P1 API gives is the gross week accrual.
- **Masking:** renter phones masked server-side (`+62812****901` shape). Never render an unmasked number even if data somehow carried one.
- **Fixture data:** the dev database seeds are demo data; label synthetic figures as such when present. All figures in the anchored mock are mock fixtures.

## Constraints

- RLS owner isolation: a resource outside the caller's scope returns 404, never 403; without a session the streams return 401.
- Language Bahasa Indonesia; IDR/WIB/`dd/mm` conventions; tabular numerals for every figure that stacks in a column.
- Minimum viewport 360 px; WCAG 2.1 AA contrast; sensible touch targets for any control.
- Do not touch `(renter)`, `(admin)`, or `apps/staff` surfaces or their design records; each group carries its own world.
- No bike GPS or dockless affordances; no renter identity beyond the masked phone on this surface.
- The renter group's DESIGN.md (Poster Solidaritas) explicitly scopes itself out of `(owner)` — never import its rules wholesale.

## Chosen direction — Poster Solidaritas (Pemilik)

**Resolved 11 Nov 2026:** the steered grounded candidate
**Poster Solidaritas (Pemilik)** wins (user decision over the assigned Tenun
Songket; no further roll).

- Anchored mock: `apps/web/.impeccable/mocks/decision/grounded-poster-solidaritas.html`, frame 390×844.
- Materials/thesis from the mock stand, with one house correction: small text
  on red uses the renter world's AA-deepened `#B81B0D` (var `--merah`), not the
  mock's raw `#DC2110`.
- The renter poster's *rules* still do not govern this group — the owner
  variant is its own read of the shared world (Operate mode, phone-first,
  read-mostly; no slogan marquee duty).

Decision trail (recorded in `.impeccable/` artifacts):

1. First round (`decision-payload-owner.json`): the roll assigned **Buku Saldo** (the bank savings passbook).
2. The recorded answer was a re-roll in the **bolder** register (`questions/f3d33bc3.answer.json`).
3. Second round (`decision-payload-owner-reroll.json`): the re-roll assigned **Tenun Songket**, with the user's steered grounded candidate **Poster Solidaritas (Pemilik)** added as a card.

**Steered candidate (anchored mock, not locked):** `apps/web/.impeccable/mocks/decision/grounded-poster-solidaritas.html`, frame 390×844.

- Thesis: "Owner and renter speak one language: the same flat poster world carries the owner's oversight screen."
- Palette (raw mock values, unadapted): kertas `#F0E3C4`, hot red `#DC2110`, kuning `#F2B300`, tinta `#171009`, biru `#12408C`, hijau `#1F6B44`.
- Materials: paper ground, flat ink fields, ink typographic border, Archivo Black figures; stacked red plate, ink period tabs, ruled armada rows, flat colour bands, ink footer bar.
- Risk (from the payload): carrying the renter's campaign world onto an oversight screen risks reading as a poster rather than a console; it buys a single network voice only if the owner's daily read stays as fast as a plain table.

**Known over-claims in the mock vs the P1 API** (must be reconciled in build, whichever direction wins — the dashboard never fabricates a figure):

- "Hari ini bertambah Rp 640.000 · 9 transaksi" — the P1 API returns only the week's gross; no daily delta, no transaction count. Either becomes P2-shape or is cut.
- The "HARI / PEKAN / BULAN" period tabs — P1 gross is current-WIB-week only.
- "Ritme pendapatan pekan ini" bands — five-day history is not in this API; P2-shape.
- "Saldo berjalan" naming — the true figure is **gross earnings accrual, before commission**; copy must say gross and say the period.
- Fleet totals ("56 unit", 40/12/4 splits) — plausible only as sums of the mock's seeded data; in build they must come from the summary response.

## Unresolved

- **The owner's visual world** — resolved: Poster Solidaritas (Pemilik), see the Chosen direction above.
- Palette values and type faces — to be recorded in DESIGN.md at finish (new world, whatever wins).
- If Poster Solidaritas (Pemilik) wins: whether to inherit the renter world's AA adaptations (deepened red `#B81B0D` for text grounds, hot `#DC2110` graphics-only) — the mock still uses raw `#DC2110` behind kertas-size text.
- Where the P1 dashboard ends and P2 claims the layout (daily delta, period switch, rhythm bands) — the build cuts or stubs these honestly, it never invents them.

## Direction contract

`Poster Solidaritas (Pemilik)`. Thesis and house rules:

- **Own world:** the Poster Solidaritas sheet read as the owner's ledger book — same kertas/ink/merah/kuning tokens as the renter, but the job is oversight, not conversion: ruled tally rows, boxed figures, stamped status. Operate mode: precision and restraint, known patterns earn their place, one authored motion moment at most.
- **First viewport (390×844):** today's gross accrual as the plate's big figure, the open rentals list beneath it, then the late/risk strip — exactly what `GET /owner/dashboard/summary` returns; P2 claims (daily delta, period switch, rhythm bands) are cut or stubbed as shape, never fabricated.
- **House corrections:** AA text grounds use `#B81B0D` (var `--merah`); hot `#DC2110` is graphics-only. Masked phones, WIB-labeled times, gross-labeled money throughout.
- **Finish:** ends with the finish review, the verdict, and an `(owner)`-scoped DESIGN.md, with every shipping raster carrying its provenance.

**FINISH** — unreviewed and undocumented is unfinished; whichever direction wins, this build ends with the finish review, the verdict, and an `(owner)`-scoped DESIGN.md, with every shipping raster carrying its provenance.
