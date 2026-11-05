---
version: 1
slug: "apps-staff"
primary_target: "apps/staff"
related_targets: []
---

# Surface brief — Staff scanner PWA

## Scope

`apps/staff` — the outlet **staff scanner PWA**: the counter app that moves a bike into and out of a rental and leaves the custody trail. Visitor **mode: Operate**. One user: the staff member on shift at a single outlet, standing at the counter or at the bike, renter waiting.

## Audience, job, task

- **Audience:** outlet staff on shift. Fast, repeated, interrupted work, often one-handed.
- **Job:** hand over and take back bicycles; make every physical movement auditable.
- **Primary task:** run a **handover** — scan the voucher QR, scan the bike asset tag, complete the condition checklist, confirm — then watch the outlet's stock move. Check-in scans the bike only (no renter action anywhere).
- **Also in scope:** incident report, bike status change, periodic physical count.

## Proof / content

- Real: the event contract and staff endpoints in the SRS, the bike state machine, the custody rules.
- Every action is a device-stamped event (`clientEventId` UUID v4 + `occurredAt` device UTC), queued in IndexedDB (Dexie) and replayed idempotently; the server answers **applied / flagged / rejected**, and a flagged event never changes bike state.
- No logo, photography, or icon set exists; the name **Kayooh** is the only binding asset.

## Constraints

- Bahasa Indonesia UI, English code. IDR, WIB, `dd/mm`. `occurredAt` is the truth, never receipt time.
- Mobile-first (≥360 px), touch targets ≥44×44 CSS px, WCAG 2.1 AA.
- **Scanner hardware is not chosen** — no layout may assume handheld vs counter-docked; the shell adapts.
- Queue **capped at 500 events**; past the cap the UI blocks new scans with a visible warning rather than dropping silently.
- Config values (checklist length, photo min/max, late grace minutes, escalation) are read from server config, never hard-coded.
- Renter phone numbers masked only. Nothing crosses outlets.

## Chosen direction

**Kartu Stok** — the warehouse shelf stock card, the card that carries a running balance. Every movement gets a row, and the balance is always the last word.
**Memorable moment:** the right-hand **Sisa** column — every row resolves to a running balance, the last posted row bolded and synchronized. Corrections are struck through in red; a flagged event wears a rotated **DICATAT** stamp.

## Unresolved

- Near-cap queue warning threshold, wording, and timing (not set).
- Scanner hardware (handheld vs docked).
- SRS config parameters remain business decisions.

## Direction contract

**THESIS** — This surface is a **running stock ledger for one outlet**: every scan posts a row and the outlet's available balance moves. It refuses the category default of a KPI dashboard of tiles and cards; the app is a ruled card you post lines onto, and the balance column is the verdict.

**OWN-WORLD** — Buff stock-card ground `#E7DFC9`, near-black ink `#1B1B18`, rule blue `#2C4A7C` for structure and the primary action, correction red `#B23A2E` for struck and flagged lines. Two voices: **Inter** for labels and copy, **Roboto Mono** tabular for every time, asset tag, count, and balance so columns align. Component language: 2 px ink rules as the card's edges, ruled data columns, a bracketed sync chip, a small rotated stamp. Density is dense-but-legible, like a well-kept shelf card.

**STORY** — The staff member sees the outlet as a stock card: the day's movements in order, each one typeable straight into the balance. They trust that a scan is recorded even offline, that a wrong scan is struck and stamped rather than hidden, and that the number in the Sisa column is the truth right now. They post the next line by starting a handover or scanning.

**FIRST VIEWPORT** — The card, in this order: a **54 px app bar** (brand *Kayooh / Pindai Staf* left, the shift and hours right, 2 px ink rule under it); the **Kartu Stok Harian** block with the queue chip and four fixed fields (Outlet, Tanggal, Kategori, Petugas); then the **board** — a ruled five-column ledger `Tanggal | Keterangan | Masuk | Keluar | Sisa` whose Sisa column is tinted and ruled in blue, carrying `SALDO AWAL`, handovers, returns, a struck correction, a stamped flag, and the bolded **posted** total row; then the **actions** bar — `Mulai serah terima` as the blue primary at 48 px with a `Pindai` button beside it; then a **68 px four-tab bar** (Antrean / Sepeda / Periksa / Akun). The primary action sits in the action bar, always reachable; the balance is the last thing read.

**FORM** — **Kartu Stok**, position **1** on the grounded list (Impeccable's pick; a code-led **Operate** surface, so the build matches the chosen composition `pick-kartu-stok.html` and no comp round runs). Signature interaction: the running **Sisa** balance with the posted total row, framed by the queue chip's sync state and the DICATAT stamp. SEED REFERENCE: seed:6dc80c89314b8c37.

**FINISH** — unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
