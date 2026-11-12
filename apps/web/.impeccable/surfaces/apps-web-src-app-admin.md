---
version: 1
slug: "apps-web-src-app-admin"
primary_target: "apps/web/src/app/(admin)"
related_targets: []
---

# Surface brief — Admin console

## Scope

`apps/web` `(admin)` route group — the **platform admin console**: the desktop surface used by the single platform admin to onboard owners, outlets, bikes and staff accounts; set pricing and promotions; run weekly settlements; handle disputes, ID-verification reviews and damage claims. Visitor **mode: Operate**. One user, seated at a desk, large screen; mobile is a nice-to-have, not a target.

## Audience, job, task

- **Audience:** the platform admin (single operator), seated, desktop, read-mostly but with real mutations (onboarding, config, settlement, dispute resolution).
- **Job:** keep the network honest — every bike accounted for, every rupiah reconciled, every case resolved.
- **Primary task:** read network health at a glance (availability by outlet, money in/out, pending cases), then act on the one thing that needs it.
- **Also in scope:** owner/outlet/bike/staff onboarding, pricing & promotions config, weekly settlement runs, dispute resolution, flagged-scan review queue ("Pindai ditandai"), damage-claim decisions, audit log review. *(Digital ID-verification was removed by SRS rev 1.3; the queue is real flagged staff scans instead.)*

## Proof / content

- Real: 4 owners, 4 outlets, 150 bikes across 4 categories (Commuter, Road, MTB, Fixie); config keys in `app-config` (pricing, booking, late fees, deposits, etc.); audit log append-only; settlement cycle Mon–Sun WIB, statements Monday, payouts Tuesday, IDR 100,000 minimum.
- Every admin mutation is audit-logged (FR-SEC-02). Money is integer rupiah (`bigint`). RLS isolates owner-facing queries; admin sees all.
- No logo, palette, typeface or voice guide exists; **Kayooh** is the only binding brand asset. UI copy in Bahasa Indonesia.

## Constraints

- Desktop-first (≥1280 px), WCAG 2.1 AA contrast, Bahasa Indonesia UI with IDR/WIB/`dd/mm` conventions.
- Admin role TTL 8 h; accounts provisioned only via POST /admin/users (FR-ID-02.1).
- Money is integer rupiah; no floats. Config values are read from server config, never hard-coded.
- Must not touch renter, owner, or staff surfaces or their flows.
- Renter phone numbers masked; ID documents viewed only via audited endpoint.

## Chosen direction

**Papan Harga Pasar** — the market price board. Network health as a market board: live availability and money as painted figures on one ruled wooden surface, read standing up in one glance. The console's navigation lists every admin section (onboarding, money, cases, system) in a dark rail; the main area is a ruled board with availability by outlet on one side and money on the other, a painted total at the foot of each, and a row of case queues (verification, disputes, claims) beneath. The signature move is the **painted total** — the number that resolves the board, set large in mono, coloured by state (green when healthy, red when short).

**Memorable moment:** the board's two painted totals — availability and money — read together as one verdict on the network, with a red chip on anything short.

## Unresolved

- ~~Exact palette values and type faces~~ — resolved: committed as a seed in `apps/web/DESIGN.md` ("Kayooh Admin — Papan Harga Pasar", carbonized from `mocks/decision/assigned-papan-harga.html`); re-carbonize in scan mode once the implementation lands.
- ~~Whether the console needs a mobile companion (currently out of scope)~~ — resolved in build: no separate mobile app; the board stacks single-column below the desktop frame and stays usable down to 360 px, but mobile remains a non-target.
- ~~Config-editing UX (inline vs. dedicated page)~~ — resolved: **dedicated page** (`Konfigurasi`). Dashboard panels read; edits happen in one audited place.
- ~~Money panel on the dashboard~~ — resolved: the money panel ships as an honest **P2 placeholder** ("menunggu P2", painted `—`): settlement is a Phase 2 module, and the board never fabricates figures. Same treatment for the Uang rail pages (Settlement, Refund, Deposit) and case-queue pages without P1 endpoints.
- ~~Dashboard case queue contents~~ — resolved: real flagged-scan queue (Pindai ditandai) + audit tail from `GET /admin/audit-log`; verification queue dropped with SRS rev 1.3.
- Backend note for review: `apps/api` Better Auth config gained `trustedOrigins` for the web origin (form-CSRF on `POST /sign-in/email` from the admin masuk page); `pipe.ts` gained PATCH support and `origin` header forwarding.

## Direction contract

**THESIS** — This surface is a **market board for the network's health**: every figure painted on a ruled board, read standing up in one glance. It refuses the category default of a white ground with a left rail, blue accents and a sortable table; the board's painted totals are the verdict, and the rail is a dark wood edge, not chrome.

**OWN-WORLD** — Dark wood rail `#2B1F14` carrying buff board ground `#F4EFE2`, ink `#1B1B18`, availability green `#1D7A54`, money amber `#C77A00`, danger red `#B3271E`. Two voices: a heavy grotesque for labels and headings, **Roboto Mono** tabular for every number, so columns align and scan. Component language: 2 px ink rules as board edges, dashed hairlines between rows, painted totals at 40 px mono, coloured chips for state. Density is dense-but-legible, like a well-kept market board.

**STORY** — The admin arrives, reads the two painted totals, and knows in seconds whether the network is healthy. If something is short, a red chip names it; they open the queue and act. They trust that every mutation is audit-logged, that money is exact integer rupiah, and that the board never lies about availability.

**FIRST VIEWPORT** — A **230 px dark wood rail** on the left listing every admin section (Dashboard, Outlet, Sepeda, Owner, Staff, Settlement, Refund, Deposit, Pindai ditandai, Sengketa, Klaim rusak, Harga & promo, Konfigurasi, Audit log) with red badges on pending queues; then a **56 px top bar** (title + timestamp); then the **board** — two ruled panels side by side: availability by outlet (left) and money (right, P2 placeholder until the settlement module lands), each ending in a painted mono total; then a row of case queues (flagged scans, disputes, claims) with counts and an action button. The primary action sits in each panel's footer; the painted totals are the last thing read.

**FORM** — **Papan Harga Pasar**, position **3** on the grounded list (assigned by the roll; user locked it over the bolder re-roll). Signature interaction: the **painted total** — the large mono number that resolves each panel, coloured by state. SEED REFERENCE: seed:1b4de3a48f334fbc9a30f56a0f4ac0b8.

**FINISH** — unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
