# Surface brief — apps-web-src-app-renter-masuk.md

## Job and audience
- Route `(renter)/masuk`. Renter mode **Operate** (a task screen — form discipline, honest states).
- A guest (or returning renter) on their phone (360 px) arrives from the home alat strip or the
  `/reservasi` list header. They already CAN book and see guest tickets; sign-in exists to unlock
  promo codes/vouchers (401 `UNAUTHENTICATED` without a session) and booking history — it must
  never look like a gate.
- Visual world: the established **Poster Solidaritas** ticket/claim sheet (yellow poster, ink
  rules, Archivo stamps, WIB language). Reuses `label`, `medan`, `medan-ket`, `langkah-*`,
  `notice*`, `aksi`, `status-papan` vocabulary.

## Outcome and proof
- Primary: phone (V-PHONE) → OTP 6-digit → verified session cookie → `GET /renters/me` `{phone}`
  rendered as an account plate. Success proof = the verified phone printed back, not a generic
  "logged in".
- Benefit truth stated in one sheet: promo/voucher + booking history; guest bookings made with
  the same phone link into the account (A-17) — no new bookings are required to see history.

## Selected direction
- Same-ticket continuation of `/reservasi/baru`: slotted steps (1 NOMOR · 2 OTP) in
  `langkah-badan` sheets; the OTP entry reads as a serial field (6 boxed digits in one input,
  44 px+ targets, tabular numerals).
- After verify: a **printed account plate** (status-papan style) with the masked… no — the
  renter's own phone is not masked for themselves (`{phone}` as returned), the A-17 line, and
  the single boxed-ink action to `/reservasi`.
- No icons/emoji; borrowed stamp copy like the claim ticket world ("TIKET AMBIL ◆ ..." family)
  with masuk-specific slogans; no gradient/decoration.

## Scope and boundaries
- In: two-step flow, resend cooldown line (60 s / 5 per hour honesty), honest copies for
  429 `RATE_LIMITED` + 401 `OTP_INVALID` (+ network), signed-in re-entry (page lands directly
  on the plate), entry links on home alat + reservasi list header, same-origin proxy pipes for
  `/api/auth/*` (send/verify) and `/api/v1/renters/me` (cookie forwarding).
- Out: sign-out control, promo/voucher claims, owner/staff/admin surfaces, verification
  anything (rev 1.2 removed), password auth.
- Anti-goals: NO gate language ("wajib"), no blocking overlays on guest routes; the page itself
  carries a "lanjut tanpa akun" escape visible without scrolling.

## States and ranges
- Phone forms: `08…`, `628…`, `+62…` accepted (server normalizes to `+62…`); client hints, server decides.
- OTP: 6 digits, 5-minute TTL; ≤5 wrong attempts then invalidated; 60 s cooldown between sends,
  4 requests/hour then 429 — 60-second resend countdown shown.
- Errors: 429 (cooldown/rate), 401 (wrong/expired code), network, `renters/me` NOT_FOUND copy.
- Signed-out first load in guest token world: nothing breaks — the page is self-contained.

## Interaction and layout
- One column, 360 px min; steps replace each other (no page reload); resend timer counts down
  tabular; verify button disabled until 6 digits; focus moves into OTP on step change.
- Real fields, honest states (loading on each button), AA contrast on `--kertas`/`--kuning`.
