---
version: 1
slug: "apps-web-src-app-renter-outlets-id"
primary_target: "apps/web/src/app/(renter)/outlets/[id]"
related_targets: ["apps/web/src/app/(renter)","apps/web/src/app/(renter)/reservasi"]
---

# Shape brief — the bike catalog (renter)

**Target:** `apps/web` `(renter)` — poster `/`, list `/outlets`, new outlet detail `/outlets/[id]`. **Mode:** Persuade (poster), Operate (detail). **World:** Poster Solidaritas, unchanged.

## 1. Job and audience

A renter in Jambi on a 360px phone, deciding right now. Today they meet four bare words — COMMUTER / ROAD / MTB / FIXIE — press "Lihat ketersediaan", and land on a transposed count table. At no point in the flow does a bicycle appear (only the generic emblem above). A renter who doesn't know what a "Fixie" is cannot choose; one who picks a type with no stock (3 of 4 types in today's data) walks into a dead end.

**Job: see the bike, then choose it against real stock — at the poster, and again at the outlet.**

## 2. Outcome and proof

Success: before pressing the CTA the renter can point at the drawn bike they'd get and read how many are ready; at the outlet they see that outlet's live count per type and how the handover works.

Verified proof on hand: `GET /api/v1/outlets` returns per-category `availability` (zero/absent categories omitted), `isOpenNow`, `hours` (jsonb, unused today), and `distanceKm` only when coordinates are sent — which the renter site must never send (NEG-4). No bike ids or asset tags (NEG-2), **no photo field anywhere** (`photoKeys` exists only on `bike_events` and `deposit_claims`), no price (undecided in PRODUCT.md), `bikes.attributes` is null.

Honest limits: the bikes are **drawn**, not photographed; counts are counts of types, never of named units.

## 3. Selected direction

Keep the world; add one new unit — the **specimen row**: a ruled, keylined row carrying *the bicycle + the live figure*. It appears on both surfaces.

**A. Poster — the binder previously held words only.**
- The `JENIS SEPEDA` strip cells gain a small drawn monoline silhouette above the name: four variants (commuter, road, MTB, fixie), `currentColor`, pressed cell floods Merah Cetak with the glyph in Kertas. The strip becomes self-explaining.
- Directly below the strip and **before the CTA**: one specimen row for the chosen type — the glyph at reading size (Kertas ground, Tinta line) + type name + live figure "**11** unit siap di 3 outlet". Zero type: glyph and figure in **Nol**, no invented line, plus an inline recovery switch ("Yang siap sekarang: COMMUTER — 11 unit"). Fetch failed: no number at all, the world's dashed notice instead (0 ≠ unknown).
- CTA copy and kicker unchanged — it is simply now pressed *after* the renter has seen the bike.

**B. Outlet detail `/outlets/[id]` — the catalog at the outlet.**
- Reached by tapping an outlet; the outlet name and the visible action line "Lihat sepeda di outlet ini" form one link. The list row itself keeps its ruled count grid.
- Content: outlet identity (name, address, distance when returned, Buka/Tutup chip, today's hours from `hours` in WIB), then **four specimen rows** — this outlet's live count per type, zeros quiet, selectable (`aria-pressed`, `?jenis=`), then the honest handover line (collected at the counter by QR scan) and the world's back rule.
- Ends at the choice: no booking button, no sign-in, no price.

**Photo seam.** The specimen row renders an owner-supplied photo when one exists and the drawn glyph otherwise. Today every type renders the glyph; a photo field/upload (owner surface + storage) is a named later step, not built now.

**Memorable moment:** the four drawn bikes in the strip, and the chosen one enlarged in ink with its live figure — the poster finally shows the bicycle it has been promising.

## 4. Scope and boundaries

**In:** `PosterPicker`, new `BikeGlyph` + `BikeSpecimen`, `OutletTicket` link, new `/outlets/[id]` page, `shared.ts` helpers, `renter.css`, e2e spec refresh (the current spec is stale — it asserts a heading that no longer exists and a test for the detail page as not-implemented).
**Untouched:** API, DB, contracts, `/outlets` list behaviour (filters, refresh, error/empty states), the emblem plate, waktu picker, slogan border, sheet foot, owner/admin groups. DESIGN.md is updated at build finish, not now.
**Anti-goals:** no per-bike rows, asset tags or ids; no coordinates or maps; no prices, ratings, testimonials, brands, sizes or spec claims; no photos or stock imagery; no booking/cart/sign-in; no rounded corners, shadows, gradients, third typeface, icon set or emoji; Biru Lapis stays on the hour block only.

## 5. States and ranges

Ranges: 4 types fixed; 3 outlets / 11 bikes today (4 outlets / 150 at launch); counts 0–999. **Today only Commuter has stock, so three of four types read 0 — the zero design must look intentional at first glance.**
Poster: ok / fetch fail (dashed notice, no figure) / no outlets (honest 0) / chosen type 0 (Nol + recovery) / chosen type >0.
Detail: loading ("Memuat…") / error (red notice + Coba lagi) / unknown id ("Outlet tidak ditemukan" + back) / closed outlet (Tutup chip + hours) / mixed zeros.
No new motion anywhere; the glyph swap is instant.

## 6. Interaction and layout

Reading order (amended): slogan → emblem plate → waktu → **jenis strip** → **specimen row** → CTA → outlet name strip → live catalog → foot.
Strip cells are ≥72px tall buttons with `aria-pressed`; glyphs `aria-hidden` (the name carries the meaning). The specimen row is 3px ink keyline on Kertas, glyph box ~96px, name in Archivo Black, figure tabular, caption in body; its figure line is `aria-live="polite"` so switching type announces the new count. Detail rows are the same unit, ≥96px each.
**Glyph floor:** each type must stay identifiable at 64px wide with the world's stroke ratio (~3% of the viewBox); if a variant fails, the strip drops to name-only cells and the drawing lives only in the specimen row.
Responsive rules unchanged: full-bleed phone, 520px centred sheet from 1024px, strip stays one row of four at 360px.

## 7. Constraints and open decisions

Binding: Next.js App Router; TanStack Query key `["outlets"]` — the detail reuses it, no new call and no new endpoint; `@repo/contracts` types; Bahasa Indonesia UI, English identifiers; WCAG 2.1 AA; 44px targets; 360px minimum; no new dependencies.
Settled by you, not to be invented: end at the choice and state the next step; **no per-type copy lines** (silhouette + name + count only); zero types stay visible with a switch to what is ready; glyph-as-placeholder until owner photos exist.
Open, only when relevant: the today's-hours line on the detail (real data in the payload — recommended); a future `GET /outlets/:id` once outlet counts grow; owner-side photo upload as its own step.
