---
version: 1
slug: "apps-web-src-app-renter"
primary_target: "apps/web/src/app/(renter)"
related_targets: []
---

---
version: 1
slug: "apps-web-src-app-renter"
primary_target: "apps/web/src/app/(renter)"
related_targets: []
---

# Surface brief — Renter website

## Scope

`apps/web` `(renter)` route group — the **renter website**: the poster-led entry and the live outlet catalog for someone in Jambi who wants a bicycle for a few hours. Visitor **mode: Persuade** (poster leads; the catalog beneath it is the working substance, not a decorative footer). Mobile-first, 360 px minimum width, Bahasa Indonesia.

## Audience, job, task

- **Audience:** a renter in Jambi, on a phone, deciding where to get a bike right now.
- **Job:** find a staffed outlet with the bike category they want, with stock confirmed by the server — not by a client cache.
- **Primary action:** pick waktu (Pagi/Siang/Sore/Malam) and jenis sepeda (Commuter/Road/MTB/Fixie), then "Lihat ketersediaan" → `/outlets` with those choices carried as query params; or scroll to the live catalog on the same page.
- **Also in scope:** the shared `(renter)` layout (ink desk ground, cream sheet), the `/outlets` catalog tool (TanStack Query, refresh, working category filter), loading / error / empty states in the world's vocabulary.

## Proof / content

- Real: the network baseline — 4 outlets, 150 bikes across four categories; availability counts come only from `GET /api/v1/outlets` (per-category COUNTS, never bike ids — NEG-2). Zero-bike categories are omitted by the API.
- The home page computes its "siap" figure from the live response (sum of availability counts; open-outlet count). When the fetch fails, the poster says so honestly and offers refresh; no invented figures.
- No logo, palette, typeface or voice guide exists; **Kayooh** is the only binding brand asset. UI copy in Bahasa Indonesia; IDR/WIB/`dd/mm` conventions.
- The OSPAAAL solidarity silkscreen reference (`.impeccable/mocks/reference/`) sets the craft level only — its name, fist, and copy are not reused. The approved shape is `.impeccable/mocks/decision/challenger-ospaaal-poster.html` (Kayooh's own words: "SEPEDA SIAP ◆ DI OUTLET NYATA").

## Constraints

- Data & API logic unchanged: fetch, TanStack Query, `@repo/contracts` types, error handling; routing structure `(renter)`/`(owner)`/`(admin)` untouched. Only the presentation layer is rebuilt.
- No renter-facing endpoint may end a rental or change bike state; the catalog never shows bike ids.
- Money is integer rupiah; no floats.
- WCAG 2.1 AA contrast; touch targets ≥ 44 px; `prefers-reduced-motion` respected for the one authored motion moment.
- No fabricated claims (no invented prices, testimonials, outlet counts, or "5 outlet" figures — everything rendered comes from the response or is generic).

## Chosen direction

**Poster Solidaritas** — the OSPAAAL solidarity silkscreen applied to Kayooh: flat fearless fields, one saturated ink pass for the emblem, the slogan repeated as a set border. The offer printed as one flat poster: the bicycle emblem in focus, the promise running around it as a set border; the search set inside the printing, the action boxed in ink. Paper cream ground, hot-red emblem plate, sun-yellow stamp strip, ink rules, one blue accent reserved for the "lapis" state. User-pinned over the dealt hand (the challenger in `decision-payload.json`, verdict competitive); the assigned direction (Cat Rangka) was not taken.

**Memorable moment:** the yellow "siap" strip slapped across the red emblem plate — the live unit figure set in Archivo Black on a rotated stamp — over a bicycle drawn in one continuous cream line, with the slogan border running around the whole sheet.

## Unresolved

- Exact type ramp and spacing scale (recorded in DESIGN.md at finish, since this is a new world).
- Booking flow (reserve → pay → QR) is out of scope for this rebuild; "Lihat ketersediaan" lands on the live catalog, not on a checkout.
- Desktop treatment beyond the centred sheet (ink desk, vertical slogan margins) may tighten at the finish review.

## Direction contract

**THESIS** — This surface is **one printed poster that works**: the promise set in silkscreen, the bicycle emblem in focus, the slogan running around the sheet as a set border, and the search + live catalog printed inside the same impression. It refuses the category default (white marketplace, photo hero, big search field, card grid) and it refuses a "poster skin on a template": the world's material carries the ground and every major surface, and every control is rebuilt in the world's vocabulary.

**OWN-WORLD** — Paper cream `#F0E3C4` ground; deep print red `#B81B0D` emblem plate (the comped `#DC2110` deepened one ink pass so small text on it clears WCAG AA 4.5:1); sun yellow `#F2B300` stamp strip and keyline accents; ink `#171009` rules, outlines, CTA bar and masthead type; lapis blue `#12408C` reserved for the selected "lapis" hour block. Two voices: **Archivo Black** for display voices (masthead, the "siap" figure, CTA verb), **Archivo** (500/600/700) for labels, body and tabular counts. Component language: 3 px ink keylines (zero-blur, no soft shadows), hard-edged flat fields, rotated stamp elements, repeating slogan border as page chrome, ruled tabular count columns (COM/ROD/MTB/FIX), dashed hairline separators. No gradients, no rounded cards, no icons from a set — the bicycle is drawn SVG line-art.

**STORY** — The visitor reads the border, sees KAYOOH JAMBI and the line-drawn bicycle, reads the live "siap" figure and the one-transaction line beneath it, picks waktu and jenis, and presses the boxed-ink action. They believe the number because the page tells them where it comes from. They land on `/outlets` with their choices carried, see the same counts live, refresh or filter by category, and pick the outlet with stock.

**FIRST VIEWPORT** — Top: two repeating slogan borders ("SEPEDA SIAP ◆ DI OUTLET NYATA" / "A BIKE IS WAITING ◆ AT A REAL OUTLET"), ink on red and yellow. Then the **emblem plate** (red field, 3 px ink keyline): masthead KAYOOH / JAMBI with a yellow date block (SELASA 05/11, computed WIB), the cream line-art bicycle SVG at full width, the rotated yellow "siap" stamp carrying the **live total units ready** and "unit siap hari ini · N outlet" (from the fetch), and the one-line truth note ("Angka ini datang dari satu transaksi di server…"). Below the plate: "Pilih waktu" segmented bar (PAGI/SIANG/SORE/MALAM, SIANG set as "lapis" blue/yellow) and "Jenis sepeda" segmented bar (COMMUTER on red/kertas). Then the **ink CTA bar** (yellow keyline): kicker "COMMUTER · SIANG · 05/11", verb "Lihat ketersediaan", arrow — a link to `/outlets?kategori=commuter&waktu=siang`. Bottom of the sheet: a ruled strip of the real outlet names from the response. The live catalog follows on the same page as ruled "kartu pos" rows — no soft cards.

**FORM** — **Poster Solidaritas** (OSPAAAL solidarity silkscreens), the user-pinned challenger from the renter decision hand (`decision-payload.json`, verdict competitive), pinned over the assigned roll. SEED REFERENCE: seed: none (unavailable). Signature interaction: the slogan border drifts slowly (one authored motion moment, `prefers-reduced-motion` disables it); the yellow "siap" stamp is the focal figure.

**FINISH** — unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
