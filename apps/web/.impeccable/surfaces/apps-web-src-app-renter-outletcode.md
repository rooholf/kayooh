# Surface brief — apps-web-src-app-renter-outletcode.md

Revision 1.3 (B2B2C link-in-bio pivot): the renter entry point is a **direct,
outlet-specific URL** ("link-in-bio") — `/JMB-001` etc. The old multi-outlet
discovery aggregator (/outlets directory, the "Ketersediaan Langsung"
all-outlet section) is removed from the renter surface.

## Job and audience

- A renter tapped a bio link of **one owner's outlet**. Their job: see what is
  ready there, what it costs, and book in as few taps as possible.
- Mode: **Persuade** — the page IS the product promise (the painted plate: a
  bike is physically waiting at a named address). Conversion funnel: bio link →
  (optional type tap) → **Book Now!!** → checkout (phone is the only required
  input) → pay 50 % DP.
- Owner is white-label: the outlet's name/address/hours carry the page; KAYOOH
  stays as the engine's masthead on the emblem plate.

## Aesthetic (incumbent world — Poster Solidaritas)

- Keep the existing committed visual world verbatim: yellow poster sheet,
  ink rules, Archivo/Archivo Black, warm tokens, ruled specimen rows,
  boxed-ink `.aksi` action, hardcoded hard offsets (in-world), slogan borders.
- New building blocks reuse the vocabulary: `plate`, `pos-nama`,
  `outlet-identifikasi`, `spesimen`-ruled rows with `BikeGlyph`, `chip`,
  `catatan`, `notice*`, `kaki`, `alat`.
- One authored motion moment only: the new bicycle drawing (owner's mod),
  the slogan borders stay CSS marquee; SSE count changes flip the figure with
  a no-JS-fallback (no animation).

## Content roles on `/[outletCode]` (server, dynamic)

1. Poster plate: masthead + tanggal + bicycle + an honest "siap sekarang"
   line computed from the live by-code response (never invented; on failure
   the poster says so).
2. Outlet identification: name (pos-nama), address, today's hours in WIB,
   Buka/Tutup chip, outlet description (owner's character line), DemoTag.
3. **Booking engine rows** (client isle, SSE-patched): one ruled row per
   offered category — glyph · name · tabular "N unit siap sekarang" · price
   line from a real quote of the default window ("Mulai Rp X · 2 jam · 1
   sepeda"). Zero-bike categories omitted from the response never render;
   live counts may become 0 — visible, quiet, honest (plus inline recovery
   switch to the ready type). Selected row pressed.
4. Primary CTA: **Book Now!!** → straight to the checkout
   `/reservasi/baru?outlet=<id>&jenis=<chosen>` — no intermediary screens.
   Secondary: small "Masuk" account link in the alat strip (optional,
   unlocks promos only).
5. Footer: serah-terima honesty line + kaki.

## 404 (unknown/inactive code)

`notFound()` → poster-honest state page (never a raw Next 404): the papan
says the link is wrong/changed and gives the one recovery path to `/`.

## Guest checkout `/reservasi/baru` (checkout of the funnel)

- Accessed with outlet+jenis prefilled; **defaults: first bookable WIB slot
  (today, else the first day with one), 2 jam duration, 1 bike** — all pickers
  stay visible and changeable; the only *required* input is the phone.
- The day/duration switchers keep a live prefilled selection (never dead-end
  into a null slot).
- The 50 % DP stays clearly calculated on the invoice sheet
  (`dpIdr` from the server quote; balance shown as offline remainder).
- Honest copies unchanged: server is the only authority (INV-1/INV-2),
  429/401/409 copies as built.

## States and boundaries

- Fetch failure of availability: hide figures, say so, keep Book Now (server
  decides at lock). NEG-2 (counts only), NEG-4 (no coordinates anywhere),
  NEG-8 (no cancel/relocate gifts on the poster).
- 360 px min, 44 px+ targets, AA contrast (NFR-07).
- Copy Indonesian except the sanctioned English CTA/slogan motifs of the
  poster world (`Book Now!!`, slogan borders).
