---
version: 1
slug: "apps-web-src-app-renter-reservasi"
primary_target: "apps/web/src/app/(renter)/reservasi"
related_targets: ["apps/web/src/app/(renter)/outlets/[id]","apps/web/src/app/(renter)/masuk","apps/web/src/app/(renter)/verifikasi","apps/web/src/app/(renter)/deposit"]
---

> **Build amendments (SRS revisions 1.1 / 1.2) — these supersede the stale lines below.**
> - **No security deposit (rev 1.1).** Any `/deposit` gate, deposit statuses, and `DEPOSIT_REQUIRED` below no longer exist.
> - **No ID verification / guest checkout (rev 1.2).** `POST /reservations` is **public**; a guest books with **`contactPhone` (required, V-PHONE)** and sign-in is **optional** (only a `promoCode` needs a session → 401 `UNAUTHENTICATED`). Any `/verifikasi` gate, gate-status stamps, and `VERIFICATION_REQUIRED` below no longer exist. `GET /renters/me` is **not** a gate read.
> - **`POST /pricing/quote` is public.** Availability, outlet detail, quote and reservations are all reachable signed-out; the only gate left is the guest phone field (step **2 DATA**).
> - **Realized topology (as built, `feature/fr-inv-02-renter-booking`):** `/reservasi/baru` = the checkout sheet (1 PILIH · 2 DATA · 3 BAYAR, reached from an outlet’s CTA with `?outlet=&jenis=`); `/reservasi` = the reservations list (session-only, plus a **Tiket di perangkat ini** section for guest `guestToken`s); `/reservasi/[id]` = status + step **4 QR** voucher. No `/masuk`, `/verifikasi` or `/deposit` routes were built.
> - The 15-minute hold, the 60 s voucher TTL refetch, the 50 % online DP split, and the no-self-cancel rule below are **unchanged and authoritative**.

# Surface brief — Pilih sepeda & reservasi (“jalur tiket ambil”)

## Scope

`apps/web` `(renter)` route group — the **reservation path**: from an outlet’s “Lihat sepeda di outlet ini” link through jenis/jam/durasi choosing, the mandatory gates, the price, the stock lock and payment, to the QR voucher the renter shows at the counter. Visitor **mode: Operate** — the renter is completing a task and committing money; the world stays Poster Solidaritas, but expression yields to scanability, honest state, and speed.

Route topology (proposed; builder must not invent a different one silently):

- `/outlets/[id]` — **the chooser**: outlet profile (name, Buka/Tutup, address, hours, character description) and the catalog brief’s **specimen rows** (glyph + name + count + `?jenis=` selection); this brief layers jam ambil + durasi beneath them and the sticky action bar below that. Public.
- `/reservasi` — the renter’s reservations, active ticket first. Renters only.
- `/reservasi/[id]` — payment handoff, status, and the QR voucher. Renters only.
- Gates: `/masuk` (phone OTP), `/verifikasi` (ID), `/deposit` — reached from the flow with a `lanjut` returnTo, and from notifications. Their full treatment may earn its own round; this brief fixes their states and entry/exit behavior.

Out of scope: the poster home and catalog rebuild (their brief governs), owner/admin/staff surfaces, reallocation offers, late-fee collection, notifications content.

**PRD authority.** The request’s “bike choosing” resolves to choosing **jenis + window at one outlet**. Reservations are category-level; a specific bike is bound only at staff check-out (SRS A‑05). The flow never renders bike ids, asset tags, or per-bike rows (NEG‑2); discovery stays outlet-first.

**Composition with the approved catalog shape** (`apps-web-src-app-renter-outlets-id.md`). The specimen row is the single per-type unit on both surfaces; on `/outlets/[id]` it replaces both a ruled count grid and separate jenis segments, and the catalog brief’s “no booking CTA” is that build’s scope — here its handover line is superseded by the gated action bar. **One figure per type:** the now-count until a window is chosen, the window count after, captions honest (“siap sekarang” vs “siap 14:30–16:30”); never both, never invented.

## Audience, job, task

- **Audience:** the renter on a phone who has decided to rent now or soon — and the first-timer whose verification or deposit is missing.
- **Job:** turn intent (“Commuter, this afternoon at Telanaipura”) into a **locked reservation and a QR they can present**, without ever dead-ending.
- **Primary action:** choose outlet → jenis + jam ambil + durasi → pass the gates → lock stock and pay → carry the QR.
- **Success:** one reservation per intent, no double-charge, and the renter always knows what the current state means (unpaid hold, paid, no-show, sold out).

## Proof / content

- **Real endpoints:** `GET /outlets/{id}` and `GET /outlets/{id}/availability` (public) for the window count; `GET /renters/me` for gate statuses; `POST /pricing/quote` for price; `POST /reservations` (header `Idempotency-Key`) for the lock; `GET /reservations/{id}` for status; `GET /reservations/{id}/voucher` for the token.
- **Real rules (from SRS):** unpaid hold 15 min (`hold.checkout_minutes`, FIXED); paid reservation released as no-show at start + 60 min (`noshow.grace_minutes`, FIXED); slots 15 min; duration 60–1440 min; advance ≤ 7 days; opening hours are FIXTURE 07:00–19:00 WIB; voucher TTL 60 s (refetch at TTL/2).
- **No invented numbers.** Every count, price and clock comes from a response. Rate fixtures (commuter 10 000, road 20 000, MTB 15 000, fixie 10 000 per unit) and deposit fixture 200 000 are FIXTURE — they may appear only as returned quote figures.
- Copy is **Bahasa Indonesia** in the poster’s voice; IDR tabular, WIB, `dd/mm` dates. No availability claim the server did not make.

## Constraints

- Auth-gated: quote, reservations, renters/me. Availability and outlet detail are public — the chooser works signed-out; price and lock arrive after the gates.
- Verification and deposit are mandatory before any reservation (PRD 4.2; API returns 422 `VERIFICATION_REQUIRED` / `DEPOSIT_REQUIRED`). The flow routes through the gates and resumes the pending choice; no dead ends.
- No renter cancellation endpoint exists (NEG‑8): no “Batalkan” control anywhere; copy states the paid reservation is released only as a no-show at start + 60 min.
- The renter cannot end a rental, change bike state, or confirm custody; the QR is shown to staff. Nothing in the flow implies phone-side custody.
- Mobile-first, 360 px minimum; WCAG 2.1 AA; touch targets ≥ 44 px; `prefers-reduced-motion` respected.
- Money is integer rupiah; format returned integers only, never compute with floats.
- Touch nothing outside the path: the catalog row gains **one** link with one visible verb (“Lihat sepeda di outlet ini”), not a second control; the poster’s silhouettes and specimen row belong to the catalog brief; owner, admin and staff surfaces stay untouched.
- Reuse the world’s components (action bar, segments, chips, ruled rows, notices); new components must stay in its vocabulary — no new faces, no new colors, Biru Lapis still only on the chosen hour block.

## Chosen direction

**Tiket Ambil** — an extension of Poster Solidaritas, not a new world: the reservation path is printed as a claim-ticket sequence. Four numbered stamp plates (**1 PILIH · 2 DATA · 3 BAYAR · 4 QR**) stamp in as steps complete; the confirm step is a ruled invoice with a painted total; the hold is a stamped square clock; the voucher is a perforated claim ticket carrying the QR. Merah carries commit, kuning the stamp accents, tinta the rules and type; Biru Lapis stays reserved for the selected hour block (One Blue Rule).

**Memorable moment:** the **hold clock** — the 15-minute payment window as a stamped square figure in Archivo Black tabular; at zero the plate is struck through with one ink rule and “KEDALUWARSA” is stamped. The voucher later arrives with the same stamp language, as the ticket that was bought.

## Unresolved (assumptions marked)

- Gate topology as routes (`/masuk`, `/verifikasi`, `/deposit`) with `lanjut` returnTo — assumed; may become steps inside `/reservasi` if the build prefers.
- Duration presets 1j / 2j / 4j / 8j plus a ±15 min stepper — proposed.
- The poster’s coarse waktu blocks prefill nothing silently and map to no invented hour bands (PRD defines none); the chooser defaults to the next bookable slot in WIB.
- Xendit return URL is server-side config; the return route assumes `/reservasi/{id}` with polling (~3 s) plus a manual “Perbarui status”.
- `/reservasi` is included so the voucher is reachable after the session; if the build trims, keep the active card, drop history pagination.
- Reallocation (`at_risk` → alternatives / reallocate / decline) is P1 lifecycle but **not this brief**; the voucher must not invent controls for it.
- Exact copy and any new type steps are finalized at build against DESIGN.md’s observed steps.

## Direction contract

**THESIS** — This surface is **the poster’s claim check**: once the renter commits, the page becomes a printed ticket they carry — choice plates stamped in sequence, money as painted figures, the hold as a running stamp, the QR as the ticket’s seal. It refuses the checkout default (blue progress bar, card forms, confetti) and keeps the material: flat fields, 3 px ink rules, tabular figures, no rounded corners or shadows. Every number is printed from a server response.

**OWN-WORLD** — Paper `#F0E3C4` ground; Merah Cetak `#B81B0D` for commit and stamped states; Kuning Matahari `#F2B300` for stamp accents and the keyline; Tinta `#171009` for rules and type; Biru Lapis `#12408C` only on the selected hour block. Two voices as DESIGN.md: Archivo Black for display and figures, Archivo for labels and body. Ticket component language: numbered stamp plates on ink rules, ruled invoice rows with a dashed separator and painted total, a perforated voucher edge (dashed rule, not a card), countdown square with tabular digits, zeros in **Nol** grey. No gradients, no shadows, zero radii.

**STORY** — From an outlet row, “Lihat sepeda di outlet ini” opens the outlet sheet: character, hours, the specimen rows (the bike + live count), then jam ambil + durasi cells. The count for the *exact window* comes from the server; “Lanjut” stamps step 1 and, if data or deposit is missing, routes through Masuk → Verifikasi → Deposit and returns with the choice intact. The confirm plate quotes (server) and shows Sewa / Diskon / Total; “Kunci & bayar” writes the lock, starts the 15-minute clock and hands to the gateway. Returning, the renter watches the clock and refreshes status until **LUNAS**; then the claim ticket with the QR — refetched every 30 s — is scanned at the counter.

**FIRST VIEWPORT** — On `/outlets/[id]`: slogan border, the back rule, the outlet masthead (name in Archivo Black, Buka/Tutup chip, address and hours in body voice), then the catalog brief’s four **specimen rows** (glyph + name + count; zeros in Nol; selection floods Merah), then the **1 PILIH** plate: “Jam ambil” day strip + slot grid, durasi presets. The single figure per type switches caption honestly (now-count until a window is picked, window count after). The sticky ink action bar carries the summary (“COMMUTER · 14:30–16:30 · 2 jam”) and a verb that names the next required step (“Lanjut”, “Masuk untuk lanjut”, “Lengkapi verifikasi”, “Isi deposit”, “Kunci & bayar”); no price figure appears before the quote.

**FORM** — Poster Solidaritas (established; renter DESIGN.md). This brief extends the world with the ticket sequence — no world decision pending. Signature interactions: the step stamps and the hold clock. SEED REFERENCE: none (no new world).

**FINISH** — unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, the DESIGN.md amendment (ticket components and any observed steps), and provenance on every shipping raster.

## States and ranges

- **Slots:** fixture hours 07:00–19:00 WIB; 15-minute increments (48 slots/day); date strip today + up to 7 days. Closed slots are shown, not hidden (struck in Nol grey); if no bookable slot remains today, default to tomorrow’s first slot.
- **Availability per window:** the selected type’s specimen figure switches from the now-count to the window count (caption “siap 14:30–16:30”); 0 → the row states “penuh” and commit is disabled with the reason; typical 1–20. A race can still return 409 `SOLD_OUT` on POST, which re-checks the window and says so.
- **Gates:** verification `not_started | pending | verified | rejected`; deposit `none | pending | held | insufficient | released`. `pending` explains manual review; `rejected` and `insufficient` name the fix and the one action.
- **Reservation:** `held` (clock running; “Saya sudah bayar — perbarui status”), `confirmed` (voucher), `expired` (rebook, fresh `Idempotency-Key`), `cancelled` `gateway_error` (“coba lagi”), `no_show` (release rule stated), `fulfilled` (post-check-out note). A late payment that cannot be fulfilled arrives as a refund notice (server-side `late_payment_sold_out`).
- **Errors:** 409 `SOLD_OUT`; 422 `VERIFICATION_REQUIRED`, `DEPOSIT_REQUIRED`, `OUTSIDE_OPENING_HOURS`, `DURATION_OUT_OF_RANGE`, `WINDOW_OUT_OF_RANGE`, `CATEGORY_NOT_OFFERED`, `AMOUNT_BELOW_MINIMUM` (promos are P2; `PROMO_INVALID` only if a code is entered); 502 `GATEWAY_UNAVAILABLE`; network failure. Each maps to one honest sentence and a named recovery.
- **Empty:** no reservations → poster-voice empty state with a “Lihat outlet” action; no availability for the chosen window → the picker itself says it, not an error box.
- **Not a target:** offline (the staff app queues; the renter app is online-first).

## Interaction and layout

- Reading order `/outlets/[id]`: back rule → outlet masthead → specimen rows (jenis selection via `?jenis=`) → **1 PILIH** (jam ambil → durasi) → sticky action bar (72 px, the world’s `aksi` component).
- Changing slot or duration re-queries availability (debounced); a zero state strikes the cell and disables commit. Never optimistic — the server decides.
- **2 DATA** (confirm): identity and gate status stamps; when signed out the bar’s verb becomes “Masuk untuk lanjut” with `lanjut` returning to the same choice. Verification and deposit steps each show status plus the single action; the pending choice survives the detour.
- **3 BAYAR:** ruled invoice — Sewa / Diskon (only if > 0) / **Total** painted; reminders: stock is locked server-side, pay within 15:00, no self-cancellation — released automatically 1 hour after the start time. Commit “Kunci & bayar” → POST with a client-generated UUID `Idempotency-Key` → on 201 hand off to `paymentUrl`; 409 re-checks the window; 502 keeps the choice with “Coba lagi”.
- Payment handoff is an external redirect; the return page (and any later open) shows the hold clock, a “Saya sudah bayar — perbarui status” refresh, and lands on the voucher when confirmed.
- **4 QR (voucher):** perforated ticket — outlet name + address, jenis, window, amount paid, a display serial, and the QR rendered from the token refetched every 30 s with a quiet “kode diperbarui” note; status stamps DIKUNCI / LUNAS / DIAMBIL / HANGUS, each with the rule that produces it. Instruction: “Tunjukkan layar ini ke staf — staf memindai QR dan tag sepeda.”
- Transitions: step plates stamp in (one authored transition; reduced motion disables it); focus moves to the new step heading; errors via `role="alert"`; the clock updates as polite text, not per-second live announcements.
- Wide screens: the same 520 px centred sheet — the poster stays a sheet; no side-by-side panels.

## Constraints and open decisions

- Reusable components: action bar, segment cells, chips, ruled rows, notices. New, in-vocabulary: stamp plate (numbered step), invoice row, countdown square, perforated ticket. No new faces/colors; blue reserved.
- Session wiring (**resolved**): no Better Auth client was added. The list’s session-only `GET /reservations` is authenticated by a **same-origin Next.js proxy** (`apps/web/src/app/api/reservations/[[...path]]/route.ts`) that forwards the caller’s Better Auth cookie to the API — chosen over adding `Access-Control-Allow-Credentials` to `apps/api` (reflecting an arbitrary origin with credentials is a smell). The detail/voucher reads use the device `guestToken` when present, else the same cookie.
- Idempotency: one UUID per reservation attempt; after 502 the attempt is spent server-side (reservation cancelled), so a retry uses a new key. Never reuse a key with a changed body (422 `IDEMPOTENCY_KEY_REUSED`).
- A reservation the renter does not own returns 404 — show “tidak ditemukan”, no leak.
- e2e: `e2e/renter.spec.ts` keeps discovery/catalog; the reservation path is covered by `e2e/renter-reservasi.spec.ts`. **Done:** the NEG‑4 coordinate guard and the NEG‑2 `assetTag|bikeId` body check are the shared helpers in `e2e/guards.ts` (`guardNoCoordinates`, `expectNoBikeIds`), inherited by both specs and run on every new renter route (the voucher page above all).
- Open for the build: gate topology (routes vs steps), duration presets, return-URL config, list depth, and final copy. None of these may change the PRD-derived truths above (no per-bike choosing, no self-cancel, server-only availability).
