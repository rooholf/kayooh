---
name: Kayooh Renter — Poster Solidaritas
description: The renter website's silkscreen poster world — flat fearless fields, one ink pass, the promise as a set border.
colors:
  kertas: "#F0E3C4"
  kertas-deep: "#E6D6AE"
  merah: "#B81B0D"
  kuning: "#F2B300"
  tinta: "#171009"
  biru: "#12408C"
  nol: "#6E6350"
typography:
  display:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.125rem, 11vw, 3rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "0.18em"
  title:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.15
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.5625rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.24em"
  desk-slogan:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "clamp(1rem, 1.6vw, 1.5rem)"
    fontWeight: 400
    letterSpacing: "0.35em"
    textTransform: "uppercase"
  slogan:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.22em"
    textTransform: "uppercase"
  masthead:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 9.5vw, 2.625rem)"
    fontWeight: 400
    lineHeight: 0.95
  stempel:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 5.4vw, 1.4375rem)"
    fontWeight: 400
    lineHeight: 0.98
  figure:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 5.4vw, 1.375rem)"
    fontWeight: 400
    lineHeight: 1
    fontVariantNumeric: "tabular-nums"
  cta-verb:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 5.6vw, 1.375rem)"
    fontWeight: 400
    lineHeight: 1
  outlet-name:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 5.2vw, 1.3125rem)"
    fontWeight: 400
    lineHeight: 1.15
  band:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "0.18em"
    textTransform: "uppercase"
  band-small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.06em"
  kaki:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.65625rem"
    fontWeight: 600
    lineHeight: 1.6
  error-body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.55
  micro:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.12em"
    textTransform: "uppercase"
  micro-small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.53125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
    textTransform: "uppercase"
  body-small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.71875rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sharp: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  action-bar:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.kertas}"
    rounded: "{rounded.sharp}"
    padding: "12px 18px"
    height: "72px"
  action-bar-hover:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.kertas}"
    rounded: "{rounded.sharp}"
    padding: "12px 18px"
    height: "72px"
  segment:
    backgroundColor: "{colors.kertas}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.sharp}"
    padding: "10px 4px 9px"
    height: "48px"
  segment-pressed:
    backgroundColor: "{colors.merah}"
    textColor: "{colors.kertas}"
    rounded: "{rounded.sharp}"
    padding: "10px 4px 9px"
    height: "48px"
  segment-waktu-pressed:
    backgroundColor: "{colors.biru}"
    textColor: "{colors.kuning}"
    rounded: "{rounded.sharp}"
    padding: "9px 4px 8px"
    height: "44px"
  chip-buka:
    backgroundColor: "{colors.merah}"
    textColor: "{colors.kertas}"
    rounded: "{rounded.sharp}"
    padding: "5px 10px 6px"
  chip-tutup:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.kertas}"
    rounded: "{rounded.sharp}"
    padding: "5px 10px 6px"
---

# Design System: Kayooh Renter — Poster Solidaritas

**Scope: the renter website only.** This document governs `apps/web/src/app/(renter)` — the poster-led home and the live outlet catalog. The `(owner)` and `(admin)` route groups are out of scope; they carry their own chosen worlds (Buku Saldo and Papan Harga Pasar) and will get their own DESIGN.md when they are built. Do not apply these rules to owner or admin surfaces.

## Overview

**Creative North Star: "Poster Solidaritas"**

Kayooh's renter website is one printed poster that works: a silkscreen field in deep print red on paper cream, the bicycle drawn in a single cream line, the promise running around the sheet as a set border, and every control set inside the printing. It is the argument of a solidarity poster applied to an errand — a bike is waiting, at a real outlet, counted by one server transaction. Tegas, jujur, tanpa basa-basi: the page never asks for trust it hasn't shown, and it never decorates what it can prove.

The world commits to flat ink. No gradients, no soft shadows, no rounded cards — depth comes from hard 3 px ink keylines and the collision of flat fields. Type is two voices: Archivo Black for display and Archivo for labels, body and figures. Numbers are set in Archivo Black with tabular figures; rupiah and distances never drift across columns.

**Key Characteristics:**
- Paper cream ground, deep print red emblem field, sun yellow stamp accents, ink outlines, one lapis blue reserved for the chosen hour block.
- Repeating slogan border as page chrome (Indonesian above, English below), the one authored motion moment.
- Ruled tabular count columns (COM/ROD/MTB/FIX) instead of cards; zero inked in a warm AA-passing grey.
- Every claim about stock is computed live from the server response; failure states are honest and in the same vocabulary.
- Hard-edged everything; rotation allowed only for the "siap" stamp (−1.2deg).

## Colors

The palette is a silkscreen pass set: one paper, two hot passes, one dark pass, one reserved blue.

### Primary
- **Merah Cetak** (#B81B0D): the deep print red — emblem plate, slogan border, selected segments, Buka chips, catalog bands, small red text on cream. Deepened one ink pass from the comped #DC2110 so small text on it clears WCAG AA 4.5:1; the hot pass #DC2110 survives only as decorative glyph colour, never as a text background.
- **Kuning Matahari** (#F2B300): the sun pass — date block, "siap" stamp, CTA keyline, the lapis hour block's inner keyline, focus-adjacent accents. Always carries ink (#171009) text; never carries small type on red passes.

### Secondary
- **Tinta** (#171009): the dark pass — outlines (3 px keylines), CTA bar, masthead ink, body text, ink rules around plates and rows.

### Tertiary
- **Biru Lapis** (#12408C): reserved strictly for the selected "lapis" hour block (PAGI/SIANG/SORE/MALAM) with yellow text and inset yellow keyline. Never used elsewhere.

### Neutral
- **Kertas** (#F0E3C4): the paper ground.
- **Kertas Deep** (#E6D6AE): hover wash on unselected segments only.
- **Nol** (#6E6350): warm grey for zero counts (AA on paper).

### Named Rules
**The One Blue Rule.** Biru Lapis appears only on the chosen hour block. If blue starts meaning anything else, the color system has failed.
**The Deep Red Rule.** Small text sits on #B81B0D or on paper; never on #DC2110. The hot pass is for graphics and decorative glyphs only.

## Typography

**Display Font:** Archivo Black (with Archivo, system-ui, sans-serif)
**Body Font:** Archivo variable, weights 100–900 (with system-ui, sans-serif)

**Character:** Cut letterforms with no counters to soften — a solidarity silkscreen masthead voice for display, paired with a sturdy grotesque that reads cleanly at 9–12 px for labels and counts.

### Hierarchy
- **Display** (Archivo Black 400, clamp(34px, 11vw, 48px), line-height 0.95): the "siap" figure — the single biggest number on the sheet.
- **Masthead** (Archivo Black 400, clamp(30px, 9.5vw, 42px), line-height 0.95): the KAYOOH wordmark on the emblem plate.
- **Stempel** (Archivo Black 400, clamp(17px, 5.4vw, 23px), tabular): the date block's day number.
- **Band** (Archivo Black 400, 13–15px, letter-spacing 0.18–0.24em, uppercase): catalog bands ("KETERSEDIAAN LANGSUNG", "KETERSEDIAAN OUTLET"), sheet-foot masthead (15px), slogan chrome.
- **Title** (Archivo Black 400, clamp(17px, 5.2vw, 22px), line-height 1.15): outlet names, CTA verb; outlet names use clamp(17px, 5.2vw, 21px), the CTA verb uses clamp(18px, 5.6vw, 22px).
- **Figure** (Archivo Black 400, clamp(17px, 5.4vw, 22px), tabular): the count-grid figures.
- **Body** (Archivo 500/600, 11.5–12px, line-height 1.45–1.55): addresses, the server-truth lines, notices. Max ~52ch.
- **Label** (Archivo 700, 8–10px, letter-spacing 0.1–0.24em, uppercase): segment cells, count column headers (COM/ROD/MTB/FIX), ticker chrome.
- **Micro** (Archivo 600/700, 8–9.5px, letter-spacing 0.08–0.34em, uppercase): ticker chrome, kickers, chips, masthead subline, desk-edge slogans at clamp(1rem, 1.6vw, 1.5rem).
- **Tanggal & kaki** (Archivo 600, 10–10.5px, line-height 1.6): sheet-foot small print and the distance line.

**Observed steps** (the steps this world actually uses; new type must pick from these or amend this list): 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 16, 18, 20, 23, 26 max display figures, plus the fluid clamps above. Do not introduce intermediate sizes.

### Named Rules
**The Tabular Rule.** Every figure that stacks in a column (counts, distances, the siap number, dates) uses tabular numerals (`font-variant-numeric: tabular-nums`). Figures never wobble.
**The Two Voices Rule.** Display is Archivo Black, everything else is Archivo. No third face, no mono, no serif.

## Layout

One sheet per viewport, centred on an ink desk. On phones the sheet is full-bleed; from 1024px it is a centred column (max 520px) with 3 px yellow edge rules and, from 1280px, vertical outlined slogans on the ink desk either side (aria-hidden, decorative). Minimum width 360px — the sheet never clips below that.

Reading order is fixed: slogan borders → emblem plate → waktu/jenis pickers → boxed-ink action → outlet-name strip → live catalog → sheet foot. Spacing rhythm alternates dense blocks (plate, pickers) with ruled separators; more space above a heading than below it. Full-page rhythm on the catalog: 14–16px row padding, 2px ink rules between rows, 3px rules capping the list.

## Elevation & Depth

No shadows — flat by doctrine. Depth is conveyed by (1) hard 3 px zero-blur keylines (`box-shadow: 0 0 0 3px` is used as an outline, not a shadow), (2) tonal collision of flat fields (red on cream, ink on red, yellow on ink), (3) rotation of exactly one element (the siap stamp, −1.2deg). Nothing floats; everything is printed.

**The Flat-Ink Rule.** If a treatment would read as elevation (soft blur, offset shadow, glow), it is rejected. Print passes overlap; they do not float.

## Shapes

Zero radii everywhere (`0px`). Outlines are 2–3 px solid ink (3 px on the plate, pickers, CTA, count grid; 2 px on inner rules and dashed notice boxes). The only non-rectangular form is the bicycle line-art (the drawn glyph and the emblem plate bicycle) and the diamond separators (◆) in the slogan border. No circles, polygons, or clip-path cutouts beyond the bicycle's two wheels.
- **BikeGlyph**: four monoline silhouettes (commuter, road, mtb, fixie), one continuous `currentColor` stroke at the emblem's stroke ratio (~5% of viewBox), outline-only, never filled, never an icon set. Decorative (`aria-hidden`); the type name carries the meaning. If a variant fails to read at 64 px wide, the strip falls back to name-only cells and the drawing lives only in the specimen row.

## Components

### Buttons / Action
- **Action bar** (`.aksi`): the primary CTA — ink fill, yellow keyline, kicker in yellow (choice summary, tabular), verb in Archivo Black cream, yellow arrow SVG. Min-height 72px. Hover lifts 2px (the only transform on hover), active returns to rest.
- **Refresh button** (`.muat-ulang`): ink fill, yellow text and label, drawn SVG rotate-arrow, 44px+ touch target, `white-space: nowrap`.
- **Segment cells** (`.baris > button`): 3 px ink cell dividers, Archivo 700 uppercase; pressed = Merah Cetak with kertas text; the hour block's pressed state is Biru Lapis with kuning text and 3 px inset kuning keyline. `aria-pressed` always.
- **Filter chips** (`.filter-baris > button`): same vocabulary; SEMUA plus four categories; pressed = Merah Cetak.

### Chips
- **Buka / Tutup**: flat solid chips — Merah Cetak ("Buka") and Tinta ("Tutup"), kertas text, Archivo Black 9px, letterspaced. No dots, no icons.

### Rows (not cards)
- **Outlet ticket** (`.pos`): name in Archivo Black, address in Archivo 500, distance uppercase tabular; right-aligned Buka/Tutup chip; below a ruled 4-column count grid (2 px ink rules, `dt` headers COM/ROD/MTB/FIX, `dd` figures in Archivo Black tabular). Zeros in **Nol** grey; the selected category cell floods Kuning Matahari with ink figures. Never boxed in cards; the row is capped top and bottom by 3 px ink rules. One affordance: the name plus the visible action line ("Lihat sepeda di outlet ini") form a single link to `/outlets/[id]` — never a second control.
- **Specimen row** (`.spesimen`, `BikeSpecimen`): the bicycle drawn as glyph + type name + live figure, the unit used on both the poster and `/outlets/[id]`. 3 px ink keyline on kertas ground; glyph box ~96 px in `currentColor` (decorative, `aria-hidden`); name in Archivo Black uppercase; figure tabular in Archivo Black; caption in body voice. Zeros render in **Nol** grey with an inline recovery switch ("Yang siap: …") when another type is ready; `count === null` (fetch failed) renders nothing — the parent shows the honest dashed notice instead of a fabricated number. Detail mode rows are selectable (`aria-pressed`, `tabIndex=0`, Enter/Space); the selected type floods Merah Cetak with kertas text/glyph and is stamped in `?jenis=`.

### Notices
- **Error / empty**: dashed 2 px ink box on paper for empty and loading; solid Merah Cetak box with kertas text for failure, always with a named recovery action ("Muat ulang" link/button). Error copy names the problem and the way out.

### Navigation
- No persistent nav bar in the world. Wayfinding is the back rule: "KEMBALI KE POSTER" link with a 3 px merah underline on `/outlets`, and the poster CTA forward. Chrome is the slogan border, nothing else.

### Signature: the siap stamp
- Rotated (−1.2deg) yellow slab with 3 px ink keyline: Archivo Black figure (live total from the server response) beside two-line uppercase label ("UNIT SIAP HARI INI · N OUTLET BUKA"). When the fetch fails the stamp is replaced by a dashed kertas notice on the red plate — never a fabricated number.

### Signature: the claim ticket (“Tiket Ambil”)
- **Step stamps** (`.langkah-strip` / `.langkah`): four numbered plates on one 3 px ink rule — **1 PILIH · 2 DATA · 3 BAYAR · 4 QR**. The number is Archivo Black, the label Archivo 700 micro. `todo` prints in **Nol**, `now` floods Merah Cetak with kertas text and a kuning figure, `done` floods Kuning Matahari with ink. The current plate carries `aria-current="step"`. These are the reservation sheet’s progress; they stamp in as steps complete — never a blue progress bar.
- **Ruled invoice** (`.nota` / `.nota-baris` / `.nota-total`): a 3 px ink box of ruled key/value rows (Archivo 600 `dt`, Archivo Black tabular `dd`), the DP row flagged with a Kuning field, and a painted **Total** bar (Merah Cetak, kertas text, Archivo Black figure). A caption states the pricing basis (“Harga per sepeda · N sepeda”) because the quote is per unit. Figures are printed from the response — never multiplied or invented (INV-5).
- **Hold clock** (`.jam-tahan`): the memorable moment — a stamped Kuning square, rotated −0.8deg, Archivo Black tabular countdown beside a two-line micro label; at zero the plate flips to kertas and the figure is struck through in **Nol**. It is polite text, never a per-second live region.
- **Status stamp** (`.status-cap`): one Archivo Black stamp per reservation state, in four tones — `commit` (Merah/kertas), `paid` (Kuning/ink), `done` (Tinta/kuning), `void` (kertas/Nol). Each is followed by the one sentence naming the rule that produces it.
- **List rows** (`.tiket-baris` / `.tiket-cap`): reservations list as ruled rows (an anchor each, never cards) — a small status stamp at the left, category·quantity + WIB window + `Total … · DP online …` stacked in body voice, a Merah arrow at the right. Rows cap the list top and bottom; no card chrome.
- **Voucher ticket** (`.tiket-ambil`): the perforated claim ticket bought at step 3 — outlet name (Archivo Black) + address, a facts list ruled with **dashed** interior rules (Jenis · Jumlah · Jendela · Dibayar · Seri), a dashed perforation (`.tiket-ambil-robek`) separating the stub from the seal, then the **QR** (`.qr`) rendered inline at ink #171009 on kertas, a quiet validity line, and the instruction “Tunjukkan layar ini ke staf…”. The QR is an inline SVG (never raster), refetched at `ttl/2`; while it loads it says so (`.qr-tunggu`) rather than showing an empty frame.
- **Tear rule** (`.robek`): a 3 px dashed ink line between sheet sections — the ticket edge, not a divider card.
- **At-risk notice** (`.notice--risiko`): solid 3 px ink keyline on Kuning ink text — a warning, distinguished from the dashed info box and the Merah error box.

## Do's and Don'ts

### Do:
- **Do** compute every stock figure from the live response (sum of per-category counts, open-outlet count); the poster never invents a number.
- **Do** keep the world's vocabulary on every new element: keylines, flat fields, tabular figures, uppercase labels.
- **Do** reserve Biru Lapis for the chosen hour block.
- **Do** keep small text on #B81B0D or on paper; the hot #DC2110 is for graphics only.
- **Do** render zero counts in **Nol** (#6E6350) — visible, quiet, honest.
- **Do** label synthetic/demo data as such when present (the dev database seeds are demo data).
- **Do** honor `prefers-reduced-motion` — the slogan drift is the only animation and it stops.

### Don't:
- **Don't** introduce rounded corners, soft shadows, gradients, or glass anywhere in the renter group.
- **Don't** use the hot red #DC2110 as a background for text.
- **Don't** add a third typeface, an icon set, or emoji in place of drawn SVG/typography.
- **Don't** show bike ids, asset tags, or per-bike rows — counts only (NEG-2).
- **Don't** claim a time-of-day affects stock; the waktu picker sets context, never a filter.
- **Don't** apply these rules to owner or admin surfaces — they have their own worlds.
- **Don't** fabricate prices, testimonials, or outlet metrics anywhere in the world.

---

# Design System: Kayooh Owner — Poster Solidaritas (Pemilik)

**Scope: the owner dashboard only.** This document governs `apps/web/src/app/(owner)` — the daily oversight portal for outlet owners (`/owner/dashboard`). Visitor **mode: Operate** — the owner completes their daily oversight check and leaves.

## Creative North Star: "Poster Solidaritas (Pemilik)"

The owner's view reads as an official ledger sheet from the same silkscreen poster world as the renter: paper cream ground, flat ink fields, hard 3 px ink keylines, and stamped typography. But where the renter sheet is built for conversion, the owner sheet is built for **oversight**: precision, restraint, ruled tally rows, boxed accrual figures, and stamped status badges.

The screen is fully responsive: designed phone-first (360 px minimum width) and adapting responsively to tablet and desktop viewports up to 1200 px container width. On desktop, the surface forms a balanced two-column grid (Accrual Plate + Rhythm section on the left; Fleet State + Active Rentals on the right), flanked by 3 px vertical ink keylines. Every figure is backed strictly by the server API (`GET /api/v1/owner/dashboard/summary`). P2 concepts (daily/monthly roll-ups and per-day rhythm) are rendered as honest placeholders — disabled tabs and an empty state — never fabricated.

## Palette

- **Kertas** (`#F0E3C4`): paper cream ground for the page, sheet, and unselected states.
- **Tinta** (`#171009`): dense ink black for 3 px keylines, text, outlet header bars, rhythm bars, and the footer.
- **Merah Cetak** (`#B81B0D`): deep print red for the accrual plate, top border banner, overdue alert stamps, and maintenance indicators. Clears WCAG AA 4.5:1 contrast against kertas.
- **Kuning Matahari** (`#F2B300`): sun yellow pass for accent typography, separator diamonds, date stamps, footer highlights, and the "BUKA ARMADA" CTA button.
- **Biru Lapis** (`#12408C`): lapis blue for active rental indicators ("TERSEWA") and the live rhythm band highlight.
- **Hijau Siap** (`#1F6B44`): solid green pass for ready-to-rent bike fleet bars ("SIAP").

## Components

### 1. Top Border Strip (`.owner-border`)
- Repeating marching-text strip in Merah Cetak with paper cream text and Kuning diamonds: `KAYOOH JAMBI ◆ PEMILIK ◆ KAYOOH JAMBI ◆ PEMILIK...`.
- 9.5px uppercase (10.5px on desktop), letter-spacing 0.22em.

### 2. Header & Date Stamp (`.owner-top`)
- Left: `KAYOOH` in Archivo Black 19px (24px on desktop), with micro subtitle `PEMILIK` in Archivo 600 Merah Cetak.
- Right: Inked stamp box (`.owner-tgl`) in Tinta with Kuning date and white uppercase day name computed in Asia/Jakarta (WIB) timezone.

### 3. Outlet Banner (`.owner-strip`)
- Solid Tinta bar with Kuning uppercase outlet name, centered diamond separator, and paper cream total fleet count (`TELANAIPURA HUB ◆ 45 UNIT`).

### 4. Period Switch Tabs (`.owner-tabs`)
- Segmented ink-bordered tabs: `HARI`, `PEKAN`, and `BULAN`. Only `PEKAN` is functional (current WIB week); `HARI` and `BULAN` are disabled P2 placeholders (opacity 0.42, `aria-disabled`, tooltip "Tersedia di P2 (laporan)"). Active tab highlighted with Merah Cetak ground and Kertas text.

### 5. Accrual Plate (`.owner-plate`)
- Framed Merah Cetak box with 3 px Tinta keyline shadow.
- Label: uppercase Kuning label `SALDO BERJALAN · PENDAPATAN KOTOR PEKAN INI` (0.24em letter-spacing).
- Amount: Archivo Black integer IDR formatted currency (e.g. `Rp 0` or `Rp 18.240.000`).
- Subtitle: `Sebelum potongan komisi · Senin–Minggu WIB` — honest labeling of gross accrual before commission, bounded Monday through Sunday WIB.

### 6. Rhythm Bands (`.owner-bands`)
- Header: Archivo Black `RITME PENDAPATAN PEKAN INI`.
- Honest P2 stub: the section keeps its place in the layout but renders an empty state (`Ritme harian tersedia di P2 (laporan).`) — no per-day bars are fabricated, since `GET /api/v1/owner/dashboard/summary` returns only the week's gross.

### 7. Fleet State Breakdown (`.owner-fleet`)
- Header: Archivo Black Merah Cetak labels `ARMADA OUTLET` and `UNIT` with a 2.5px Tinta underline.
- Proportional rows:
  - `SIAP`: Hijau Siap (`#1F6B44`) bar, count of available bikes.
  - `TERSEWA`: Biru Lapis (`#12408C`) bar, count of currently rented / held bikes.
  - `SERVIS`: Merah Cetak (`#B81B0D`) bar, count of maintenance bikes.
- Tabular numeric count in Archivo Black right-aligned.

### 8. Active Rentals & Late Alerts (`.owner-rental-row` / `.owner-late-alert`)
- Ruled list showing active rentals: bike asset tag, masked renter phone (`081234****789`), and return time labeled in WIB.
- Overdue alert banner appears in Merah Cetak with yellow count whenever overdue rentals exist.
- Empty state: clean, honest copy (`Tidak ada sewa yang sedang aktif.`) in dimmed ink.

### 9. Summary Footer (`.owner-foot`)
- Sticky-bottom Tinta bar with 3 px Kuning top border.
- Text: `${totalBikes} unit · ${ready} siap · ${rented} tersewa · ${maintenance} servis`.
- CTA: Solid Kuning `BUKA ARMADA` button with Archivo Black typography.

---

<!-- Carbonized from the implementation in apps/web/src/app/(admin) (admin console shipped). Tokens below reflect the shipped CSS in apps/web/src/app/(admin)/admin.css; re-run /impeccable document to refresh if the board drifts. -->

# Design System: Kayooh Admin — Papan Harga Pasar

**Scope: the admin console only.** This document governs `apps/web/src/app/(admin)` — the platform admin console (`/admin`). Visitor **mode: Operate** — one platform admin, seated at a desk, desktop-first (≥1280 px); mobile is a nice-to-have, not a target. The renter poster world and the owner ledger sheet do not apply here.

## Creative North Star: "Papan Harga Pasar"

The console reads as a **market price board**: network health painted as figures on one ruled buff board, read standing up in one glance. Where the renter surface is a poster and the owner surface a ledger sheet, the admin surface is a board in a wooden frame — a dark wood rail on the left, a 56 px header bar across the top, and ruled panels that always end in a **painted total**: one large mono number, coloured by state, that resolves the panel.

The board refuses the category default of admin consoles — white ground, blue accents, sortable tables, chrome. There are no cards with soft shadows and no rounded chrome: every panel is a ruled area with a 2 px ink edge, every row is separated by a dashed hairline, and every figure is set in tabular mono so columns align and scan. If something is short, a red chip names it; the admin opens the queue and acts. The board never lies about availability — counts come from the server, never from a cache (Product Principle 1).

**Status: implemented.** The admin console ships in `apps/web/src/app/(admin)`; tokens below are carbonized from `admin.css` and the route components. Re-run `/impeccable document` if the board drifts.

## Palette

- **Kayu Tua** (`#2B1F14`): dark wood — the 230 px navigation rail and the top bar's frame edge. Depth anchor of the whole screen.
- **Papan** (`#F4EFE2`): buff board ground — panels, top bar, rail text, and unselected surfaces.
- **Meja** (`#EDE7D6`): table ground — the page surround visible around the board frame.
- **Tinta Pasar** (`#1B1B18`): market ink — all rules (2 px panel edges, dashed row hairlines), body text, ghost-button strokes, and chip fills.
- **Hijau Laku** (`#1D7A54`): availability green — healthy totals, primary buttons, positive row values. Clears AA 4.5:1 on Papan (4.6:1); not for text on Kayu Tua (large use only).
- **Kuning Sorot** (`#C77A00`): highlight amber — the active rail item's fill and money accents. **Fill only, never text on Papan** (2.9:1 on the board would fail).
- **Merah Kasus** (`#B3271E`): case red — pending badges, warning values, short-state painted totals, danger buttons. Clears AA on Papan both as text (5.6:1) and as badge fill with Papan text.

## Typography

Two voices only: a heavy grotesque for words, Roboto Mono for every numeral.

**Grotesque:** Inter (700/800), system-ui fallback — titles, rail items, panel labels, row labels.
**Mono:** Roboto Mono (400/700, tabular) — every number, every badge, every meta line. No numeral is ever set in the grotesque.

### Hierarchy

- **Painted total** (mono 700–800, 40 px, line-height 1): the figure that resolves a panel. Optional 14 px mono unit suffix (`tersedia`, `Rp`). Coloured by state — Hijau Laku when healthy, Merah Kasus when short.
- **Panel label** (grotesque 800, 11 px uppercase, letter-spacing 0.16em, 2 px ink underline): the panel's heading strip; carries the panel's count chip (`150 sepeda`, `3`, `1`) in mono 700.
- **Row** (grotesque 400, 13 px; value mono 700 right-aligned): ruled by a 1 px dashed ink hairline; values coloured ok (`#1D7A54`), warn (`#B3271E`), or ink.
- **Rail item** (grotesque 400, 13 px): section labels 10 px uppercase 0.16em at 50 % opacity; brand 800 with 0.06em tracking over an ink hairline.
- **Meta** (mono 400, 12 px): timestamps and stamps — WIB, `dd/mm`, dot thousands.

### Named Rules

**The Two Voices Rule.** Words live in the grotesque, numbers live in Roboto Mono. A numeral in the grotesque is a defect.

**The Painted Total Rule.** Every board panel ends in exactly one painted total that resolves the panel — large, mono, coloured by state. A panel without a verdict is unfinished.

## Layout

Desktop-first fixed frame: a **230 px Kayu Tua rail** (four sections: Jaringan, Uang, Kasus, Sistem; every pending queue carries a mono badge in Merah Kasus), a **56 px top bar** (title 800 left, mono meta right, 2 px ink bottom rule), then the **board** — a 2-column grid of ruled panels (16 px gap, 20×24 px page padding on Meja). Density is dense-but-legible: a well-kept market board, not a dashboard grid. The primary action of each panel sits in its footer, beneath the painted total — the total is read last, the action is taken next.

Responsive behavior is deliberately minimal: the frame is designed for ≥1280 px; below that the board stacks single-column while the rail stays fixed. Mobile is out of scope until decided.

## Elevation & Depth

**Flat — zero shadows.** Depth is structural: Kayu Tua anchors the left edge, 2 px solid ink rules frame panels, 1 px dashed hairlines rule rows, and the Meja surround sets the board into the page. Nothing floats; the board is ruled, not lifted.

## Shapes

Sharp corners throughout (≤2 px radius, rail items only). The form language is the rule, not the box shadow: solid 2 px ink for structural edges, dashed 1 px ink for data rows. Buttons, chips, badges, panels — all square-cut.

## Components

### Navigation rail
- Kayu Tua fill, Papan text, 12 px vertical padding; brand block `KAYOOH · ADMIN` over an ink hairline.
- Section labels: 10 px uppercase, 50 % opacity. Items: 13 px with counts in line; active item = Kuning Sorot fill with Tinta Pasar text, 700.
- Pending queues carry mono badges: Merah Kasus fill, Papan text (AA 5.6:1).

### Board panel
- Papan fill, 2 px solid Tinta Pasar edge, 16 px padding.
- Heading strip: 11 px uppercase label + mono count chip, 2 px ink underline.
- Body: dashed-hairline rows; footer: action buttons below the painted total.

### Chips / badges
- Mono 10 px, square, tight padding (1–2 px × 5–6 px). Ink fill with Papan text for neutral states (`pending`, `open`); Merah Kasus fill for alarm states; Merah Kasus text on Papan for warning values.

### Buttons
- Grotesque 700, 12 px, square, padding 6 px 12 px.
- **Primary:** Hijau Laku fill, Papan text.
- **Ghost:** transparent fill, 2 px Tinta Pasar stroke, Tinta Pasar text.
- **Danger:** Merah Kasus fill, Papan text (destructive or case-rejecting actions).

### Painted total (signature)
- The panel-resolving figure: mono 800 at 40 px, unit suffix at 14 px, coloured by state. Two painted totals — availability and money — read together as one verdict on the network.

## Do's and Don'ts

### Do:
- **Do** set every numeral in Roboto Mono, right-aligned, with dot thousands separators (`Rp 1.240.000`) and WIB stamps (`07:12 WIB`).
- **Do** end each board panel with a painted total coloured by state; pair the availability total and money total as the screen's verdict.
- **Do** reserve Merah Kasus chips for pending, actionable work — a badge is a promise that the queue needs the admin today.
- **Do** source every count from the server; render honest empty states (`Tidak ada kasus terbuka.`) when a queue is clear.

### Don't:
- **Don't** use shadows, gradients, or radii above 2 px — the board is ruled, not lifted.
- **Don't** set Kuning Sorot (`#C77A00`) as text on Papan; it is fill and accent only.
- **Don't** import the renter or owner worlds: no Archivo Black stamps, no marching-text strips, no Kertas cream (`#F0E3C4`), no Merah Cetak (`#B81B0D`) — this is buff board and dark wood.
- **Don't** hard-code money, config, or pricing values on the board; they come from server config, and money stays integer rupiah (`bigint`) — no decimals anywhere.
- **Don't** fabricate dashboard figures: mock numbers live in fixtures and are labelled as such, never shipped as real.

