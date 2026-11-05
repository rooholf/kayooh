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

**Observed steps** (the steps this world actually uses; new type must pick from these or amend this list): 8, 8.5, 9, 9.5, 10, 10.5, 11.5, 12, 13, 15, 23 max small-cap display, plus the fluid clamps above. Do not introduce intermediate sizes.

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

Zero radii everywhere (`0px`). Outlines are 2–3 px solid ink (3 px on the plate, pickers, CTA, count grid; 2 px on inner rules and dashed notice boxes). The only non-rectangular form is the bicycle line-art and the diamond separators (◆) in the slogan border. No circles, polygons, or clip-path cutouts beyond the bicycle's two wheels.

## Components

### Buttons / Action
- **Action bar** (`.aksi`): the primary CTA — ink fill, yellow keyline, kicker in yellow (choice summary, tabular), verb in Archivo Black cream, yellow arrow SVG. Min-height 72px. Hover lifts 2px (the only transform on hover), active returns to rest.
- **Refresh button** (`.muat-ulang`): ink fill, yellow text and label, drawn SVG rotate-arrow, 44px+ touch target, `white-space: nowrap`.
- **Segment cells** (`.baris > button`): 3 px ink cell dividers, Archivo 700 uppercase; pressed = Merah Cetak with kertas text; the hour block's pressed state is Biru Lapis with kuning text and 3 px inset kuning keyline. `aria-pressed` always.
- **Filter chips** (`.filter-baris > button`): same vocabulary; SEMUA plus four categories; pressed = Merah Cetak.

### Chips
- **Buka / Tutup**: flat solid chips — Merah Cetak ("Buka") and Tinta ("Tutup"), kertas text, Archivo Black 9px, letterspaced. No dots, no icons.

### Rows (not cards)
- **Outlet ticket** (`.pos`): name in Archivo Black, address in Archivo 500, distance uppercase tabular; right-aligned Buka/Tutup chip; below a ruled 4-column count grid (2 px ink rules, `dt` headers COM/ROD/MTB/FIX, `dd` figures in Archivo Black tabular). Zeros in **Nol** grey; the selected category cell floods Kuning Matahari with ink figures. Never boxed in cards; the row is capped top and bottom by 3 px ink rules.

### Notices
- **Error / empty**: dashed 2 px ink box on paper for empty and loading; solid Merah Cetak box with kertas text for failure, always with a named recovery action ("Muat ulang" link/button). Error copy names the problem and the way out.

### Navigation
- No persistent nav bar in the world. Wayfinding is the back rule: "KEMBALI KE POSTER" link with a 3 px merah underline on `/outlets`, and the poster CTA forward. Chrome is the slogan border, nothing else.

### Signature: the siap stamp
- Rotated (−1.2deg) yellow slab with 3 px ink keyline: Archivo Black figure (live total from the server response) beside two-line uppercase label ("UNIT SIAP HARI INI · N OUTLET BUKA"). When the fetch fails the stamp is replaced by a dashed kertas notice on the red plate — never a fabricated number.

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
