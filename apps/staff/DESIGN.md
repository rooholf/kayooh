---
name: Kayooh Staff Scanner
description: A running stock ledger for one outlet — a ruled buff card you post lines onto, where the Sisa balance is the verdict.
colors:
  rule: "#2C4A7C"
  signal: "#A03227"
  card: "#E7DFC9"
  ink: "#1B1B18"
  desk: "#D9CEB1"
  line: "rgba(27, 27, 24, 0.26)"
  rule-tint: "rgba(44, 74, 124, 0.08)"
  rule-tint-2: "rgba(44, 74, 124, 0.18)"
  signal-tint: "rgba(160, 50, 39, 0.07)"
typography:
  display:
    fontFamily: "Roboto Mono, ui-monospace, monospace"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.14em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Roboto Mono, ui-monospace, monospace"
    fontSize: "9px"
    fontWeight: 500
    letterSpacing: "0.12em"
rounded:
  none: "0px"
  sm: "2px"
spacing:
  gutter: "14px"
  block: "12px"
  row: "10px"
  cell: "5px"
components:
  button-primary:
    backgroundColor: "{colors.rule}"
    textColor: "{colors.card}"
    rounded: "{rounded.none}"
    height: "48px"
    padding: "0 14px"
  button-primary-disabled:
    backgroundColor: "transparent"
    textColor: "rgba(27, 27, 24, 0.4)"
    rounded: "{rounded.none}"
    height: "48px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "48px"
    width: "92px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "44px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.rule}"
    rounded: "{rounded.sm}"
    padding: "3px 6px"
  chip-full:
    backgroundColor: "transparent"
    textColor: "{colors.signal}"
    rounded: "{rounded.sm}"
    padding: "3px 6px"
  input-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 0"
  nav-tab:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "68px"
  ledger-sisa-cell:
    backgroundColor: "{colors.rule-tint}"
    textColor: "{colors.rule}"
    rounded: "{rounded.none}"
    padding: "6px 5px"
---

# Design System: Kayooh Staff Scanner

## Overview

**Creative North Star: "The Running Stock Card" (Kartu Stok)**

The outlet is drawn as one physical thing: a ruled stock card from a warehouse shelf, and this app is that card. Every scan posts a row onto it and the outlet's available balance moves down the Sisa column. The screen refuses the category default — a dashboard of KPI tiles, cards, and stat badges — and instead presents a single dense-but-legible document you write lines onto. The balance column is the verdict, and the card is only ever read from the bottom up: what just posted, what is the number now.

The world is built from paper, ink, and two rules. The ground is a buff stock-card buff; the ink is near-black and drawn as 2 px edges, 1 px hairlines, and a single blue rule down the Sisa column. Two accents carry all meaning: rule blue for structure and the one primary action, correction red for struck-through lines and flagged entries. A wrong scan is never hidden — it is struck through and stamped `DICATAT` at an angle, right on the card where the staff member can see it. Nothing decorative is added to the page: no icons, no imagery, no rounded "app" chrome.

Density is the point: the day's movements in order, each one typeable straight into the balance, tabular numbers aligned so the eye can run down a column. Two voices do the work — Inter for labels and sentences, Roboto Mono for every time, asset tag, count, and balance — so the numbers line up and the prose stays legible at counter speed.

**Key Characteristics:**
- One card, not a dashboard: the whole screen is a single ruled stock card, max 430 px wide.
- Two accents only: rule blue for structure and the primary action, correction red for corrections and flags.
- Flat by construction: depth is drawn with rules, never with shadows.
- Two-voice type: Inter for copy, Roboto Mono tabular for every number.
- Dense but legible: a well-kept shelf card, read bottom-up.

## Colors

A buff paper ground carrying two inks — a structural blue and a correction red — with hairline blacks holding the columns.

### Primary
- **Rule Blue** (#2C4A7C): The structural accent and the only primary action. It draws the Sisa column's left rule, the section labels, the sync chip at rest, the selected tab, the active input underline, the focus ring, and the solid `Mulai serah terima` button. It is the color of "this is the spine of the card and the thing to press."

### Secondary
- **Correction Red** (#A03227): Reserved exclusively for what is wrong or uncertain — struck-through correction lines, flagged rows and their tinted background, the `DICATAT` stamp, the full-queue chip and warning, and error text. It never decorates a normal row. *(Note: the direction contract originally named this red `#B23A2E`; it shipped as `#A03227` to clear WCAG 2.1 AA contrast for the red corrections and flags, and `#A03227` is the normative token.)*

### Neutral
- **Buff Stock-Card Ground** (#E7DFC9): The card's paper. The base surface for every screen, the page background, and the ground the rules are printed on.
- **Near-Black Ink** (#1B1B18): Body text and the card's structural rules. Drawn as 2 px edges (app bar, block ends, the posted row, the action and tab bars) and as 1 px hairlines between ledger rows and list items.
- **Desk Taupe** (#D9CEB1): The surround outside the card at wide viewports — the surface the buff card sits on when the screen is wider than 430 px. It never appears inside the card.
- **Hairline Ink** (rgba(27, 27, 24, 0.26)): The 1 px vertical rule between ruled columns and the faint row dividers; the lightest structural line in the system.
- **Rule Wash** (rgba(44, 74, 124, 0.08)): The tinted background of the Sisa column — the verdict column is the only column that gets a wash.
- **Rule Wash Deep** (rgba(44, 74, 124, 0.18)): The flash color a freshly posted line settles out of (see the one motion moment, carried in the sidecar).
- **Correction Wash** (rgba(160, 50, 39, 0.07)): The background of a flagged row and the full-queue warning band.

### Named Rules
**The Two-Accent Rule.** The system has exactly two accents: rule blue for structure and the primary action, correction red for corrections and flags. Nothing else is colored, and no accent is ever used decoratively.

**The Sisa Blue Rule.** Only the Sisa column is ruled and tinted in blue. In a normal row no other number is blue; blue on a figure means it is the balance or the primary action.

**The Wash-Not-Fill Rule.** Accent emphasis is always a low-alpha wash (8%–18% blue, 7% red), never a saturated fill across a block. Solid accent fill is reserved for the primary button and the selected segmented control.

## Typography

**Display Font:** Roboto Mono (with ui-monospace, monospace)
**Body Font:** Inter (with system-ui, sans-serif)
**Label/Mono Font:** Roboto Mono — the same mono voice as Display; the pairing is Inter for words and Roboto Mono for numbers.

**Character:** A printed shelf card read aloud. Inter carries every label and sentence in a plain, unfussy voice; Roboto Mono carries every time, asset tag, count, and balance so the digits align in columns and can be scanned at a glance. The mono is not decoration — it is the ledger's arithmetic made visible.

### Hierarchy
- **Display** (Roboto Mono 700, 20px / line-height 1): The posted Sisa total — the largest type in the app and the single number the card resolves to. It appears only on the bolded posted row.
- **Headline** (Inter 700, 16px / line-height 1): The `Kayooh` wordmark in the app bar, with the `Pindai Staf` sub-brand set beneath it in 9 px tracked mono.
- **Title** (Inter 700, 12px / uppercase, letter-spacing 0.14–0.15em): Block and panel headers — `Kartu Stok Harian`, `Catat gerakan`, `Antrean sinkron`. These are the card's section headings and are always uppercase and tracked.
- **Body** (Inter 400–600, 11–13px): Sentences, field values, hints, list rows, and notices. Field values and actions sit at 13 px / weight 600; supporting copy and hints at 10–11 px.
- **Label** (Roboto Mono 500, 9px / uppercase, letter-spacing 0.12em): Field names, ledger column heads (`Tanggal | Keterangan | Masuk | Keluar | Sisa`), the `DICATAT` stamp, and the app-bar sub-brand. Tabular numerals at 10–14 px carry the row data: 10 px timestamps, 10.5 px row titles, 12 px asset tags and movement figures, 14 px scan input.

### Named Rules
**The Tabular Voice Rule.** Every time, asset tag, count, and balance is set in Roboto Mono; every label and sentence is set in Inter. No number that can be scanned down a column is left in the sans face.

**The Small-Caps Label Rule.** Field names, column heads, and stamps are 9 px Roboto Mono, uppercase, and tracked 0.12–0.14em — the printed headers of the card, never body-sized.

## Layout

The app is one stock card on a desk. The card is a single column capped at 430 px wide and 100dvh tall, centered horizontally on a `Desk Taupe` surround; at 640 px and wider (`sm`) the card gains 2 px ink side borders, so on wide screens it reads as a physical card lying on a surface rather than a full-bleed page.

The vertical order is fixed: a **54 px app bar** (brand left, shift and hours right, 2 px ink rule beneath), then the main region — the **Kartu Stok Harian** block (title, sync chip, and a two-by-two grid of four fixed fields: Outlet / Tanggal / Kategori / Petugas) above the **ledger board** — then the full-queue cap notice, then a **48 px action bar** (the blue `Mulai serah terima` primary plus a fixed-width `Pindai` button), then a **68 px four-tab bar** (Antrean / Sepeda / Periksa / Akun). The primary action is always reachable in the action bar; the balance is the last thing read.

The ledger board is the spatial signature: a five-column grid, `44px 1fr 34px 34px 60px`, for `Tanggal | Keterangan | Masuk | Keluar | Sisa`, under a fixed 26 px header row. The Keterangan column takes the flexible space; the two movement columns and the Sisa column hold fixed widths so the numbers stack cleanly down the card. The board scrolls; the header, app bar, action bar, and tab bar do not.

The rhythm is a 14 px horizontal gutter on every block, 12 px vertical block padding, 10 px vertical row padding, and 5 px ledger-cell padding. Every interactive control clears a 44 px minimum on both axes.

### Named Rules
**The One Card Rule.** The screen is a single stock card, max 430 px wide. Never a grid of tiles, cards, or KPI panels — if it is not a row on the card, it does not belong on this screen.

**The 44 Rule.** Every touch target is at least 44×44 CSS px. Staff use this standing, one-handed, with a renter waiting; the floor is set by that posture.

## Elevation & Depth

This system is flat and says so: there are no shadows anywhere. Depth is drawn instead with ruled line weight and tonal wash. A 2 px ink rule marks an edge of the card — the app bar's base, a block's end, the bolded posted row, the action and tab bars. A 1 px hairline (26% ink) separates rows and ruled columns. A 2 px blue rule plus an 8% blue wash marks the one column that carries a verdict. Emphasis is tonal: a flagged row gets a 7% red wash, a just-posted row briefly flashes an 18% blue wash. The only rotation in the system is the `DICATAT` stamp, which is drawn as ink on the page rather than lifted off it.

### Named Rules
**The No-Shadow Rule.** No `box-shadow` is used. Depth is expressed through 2 px ink rules, 1 px hairlines, and low-alpha washes; separation that would be a shadow elsewhere is a rule here.

## Shapes

The form language is the printed card: square corners everywhere, with the only exception being a 2 px radius on the two objects that are pressed onto the card — the sync chip and the `DICATAT` stamp. Edges are drawn, not rounded: 2 px ink borders frame the card and its blocks, 1 px hairlines rule the columns, and the Sisa column is fenced by a 2 px blue rule. Controls are rectangles with hard 2 px borders (primary in blue, secondary and ghost in ink), and the empty state is a 2 px dashed ink box. One geometric gesture breaks the grid: the stamp, rotated −5°, as if struck by hand.

## Components

Every component's feel is **stamped and tabular** — hard rectangular controls with 2 px borders, mono numbers, and no chrome beyond a rule.

### Buttons
- **Shape:** Square, no radius (0px), 2 px border.
- **Primary:** Solid `Rule Blue` fill with `Buff` text (48 px tall); the single `Mulai serah terima` action, and `Simpan ke antrean` in the scan sheet.
- **Hover / Focus:** Hover is not decorated; focus is a 2 px blue ring offset 2 px from the edges. Disabled state goes transparent with a 30% ink border and 40% ink text and a not-allowed cursor.
- **Secondary / Ghost:** `Pindai` is a transparent button with a 2 px ink border at a fixed 92 px width (48 px tall) beside the primary. Ghost buttons (retry, `Batal`) are transparent with a 2 px or hairline ink border at a 44 px minimum height; `Batal` is a bare rule-blue text button.

### Chips
- **Style:** The sync chip is a small bracketed rectangle — a 1 px rule-blue border, 2 px radius, 10 px Inter medium text, 3 px × 6 px padding — reading `Tersinkron` / `N menunggu` / `Luring`.
- **State:** When the queue hits capacity the chip flips entirely to correction red (`Penuh N/500`) and a full-width red-bordered warning band appears beneath the ledger.

### Cards / Containers
- **Corner Style:** Square (0px).
- **Background:** `Buff Stock-Card Ground`; `Desk Taupe` only outside the card.
- **Shadow Strategy:** None — see Elevation & Depth.
- **Border:** 2 px `Near-Black Ink` edges; 1 px hairlines between rows.
- **Internal Padding:** 14 px gutter, 11–12 px block padding; the ledger cell uses 5 px.

### Inputs / Fields
- **Style:** Underline fields — transparent background, no radius, a 2 px `Hairline Ink` bottom border, 14 px Roboto Mono text (asset tags uppercased). Labels sit above in 9 px tracked mono; hints sit below in 10 px ink/70.
- **Focus:** The underline shifts from hairline to 2 px `Rule Blue`; the caret is rule blue. Checkboxes use the rule-blue accent color at 18×18 px.
- **Error / Disabled:** Validation reason renders as an 11 px correction-red line above the submit button; the submit disables to transparent with ink/40 text.

### Navigation
- **Style:** A 68 px four-tab bar (Antrean / Sepeda / Periksa / Akun), grid of four equal cells, each with a 1 px hairline left divider. Labels are 10 px Inter; the active tab is bold `Rule Blue` with a 3 px blue bar across its top edge, the inactive are ink/70. A pending count renders beside the Antrean label in bold correction-red mono.

### Signature Components
**The Sisa column.** The ledger's rightmost column is the system's one distinctive surface: an 8% blue wash behind a 2 px blue left rule, carrying tabular mono figures. Ordinary rows show a 13 px bold balance; the posted total row bolds to 20 px, takes 2 px ink top and bottom rules, and stamps the sync time beneath in 8 px mono. This column is where the card resolves.

**The DICATAT stamp.** A small rotated (−5°) rectangle — 1.5 px correction-red border, 2 px radius, 9 px bold tracked mono — struck across a flagged row's Keterangan area. It marks a recorded-but-flagged event; it never replaces the row.

## Do's and Don'ts

### Do:
- **Do** keep the whole screen to a single 430 px stock card; treat every block as a ruled section of that one document.
- **Do** set every time, asset tag, count, and balance in Roboto Mono so columns align; set labels and sentences in Inter.
- **Do** draw structure with rules — 2 px ink for edges, 1 px hairline for separators, 2 px blue for the Sisa column — and keep the system shadowless.
- **Do** reserve correction red for struck lines and flagged rows, and blue for structure and the one primary action; keep to the Two-Accent Rule.
- **Do** hold 44×44 CSS px as the touch floor and place the primary action where a one-handed user can always reach it.
- **Do** carry Bahasa Indonesia in all UI copy, with IDR, WIB, and `dd/mm` conventions.

### Don't:
- **Don't** build a dashboard of tiles or KPI cards; the ledger and its balance are the whole view.
- **Don't** add shadows, glows, or rounded "app" chrome; corners stay square except for the chip and stamp (2 px).
- **Don't** introduce a third accent color or use blue and red decoratively.
- **Don't** set a scannable number in Inter, or a sentence in Roboto Mono.
- **Don't** hide a wrong or flagged scan — strike it, tint it, and stamp it on the card where staff can see it.
- **Don't** fabricate imagery, icons, or a logo; `Kayooh` is the only binding asset.
