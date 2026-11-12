# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Scope of this record

The outlet **staff scanner PWA** (`apps/staff`) — the installable app used at the counter. This is a sibling of the renter web app, not a child of it; the renter, owner and admin surfaces are recorded separately in `apps/web/PRODUCT.md`. The two records share the brand, not a file.

## Users

**Outlet staff — the only user.** The person on shift at one of the four staffed outlets in Jambi. They use the app standing at the counter, usually with a bike and a renter physically in front of them, and again when a bike comes back. They are on shift, not on a desk: the task is fast, repeated, and interrupted.

Custody records attribute each movement to a staff member, so staff sign in as individuals and see one outlet: their own.

## Product Purpose

Hand over and take back bicycles, and leave an audit-grade custody trail behind every movement.

This app is the system's point of truth for physical custody. Only a staff scan moves a bike into or out of a rental, so everything the renter app promises about availability is ultimately settled here. Success means: every handover recorded exactly once, correct as of the moment it happened even if it syncs hours later, and no bike ever moved without a scan.

## Positioning

Capture keeps working when everything else stops.

Each staff action is an event stamped at the device and replayed idempotently to a server that *classifies* rather than rejects — an action is applied, flagged, or rejected, and a flagged action is recorded without changing bike state. A paper notebook cannot prove when a bike left, and an online-only tool cannot take a scan when the connection drops. This app is built so the handover is never blocked by the network and the timestamps survive it.

## Operating Context

- Four staffed outlets, one staff account per person, each scoped to their own outlet.
- **Check-out:** scan the renter's voucher QR, scan the bike asset tag, complete a short condition checklist with photos, confirm.
- **Check-in:** scan the bike, inspect it, add damage photos if anything is wrong. No renter involvement at all — the renter's phone cannot end a rental.
- Also in scope at the counter: reporting an incident (mechanical failure, bike missing, bike damaged), changing a bike's status, and a periodic physical count.
- Two mounting contexts are both in play and hardware is not yet chosen: held in the hand at the bike, or docked at the counter.
- Connectivity is normally available. The offline queue is a safety net, not the expected state.
- Business hours and dates are WIB; the device may be in a different timezone than the server.

## Capabilities and Constraints

**Confirmed capabilities.**

- Offline event queue backed by IndexedDB, retrying at 5 s, 15 s, 60 s, 300 s in `occurredAt` order, capped at 500 events.
- Camera capture of the voucher QR and the bike asset tag, with a typed entry fallback for damaged codes and denied camera permission.
- Five event types: check-out, check-in, inspection, bike status change, incident.
- Photo capture attached to checklists and damage reports (uploads 1 byte to 5 MB).
- Server outcomes surfaced per event as applied, flagged, or rejected, with the reason; a flagged event never changes bike state.
- Counter views: the outlet's bikes filtered by state and category, the day's expected reservations, and overdue rentals to call.
- Physical-count health sync with a drift percentage returned.

**Constraints that future work must respect.**

- Every action is an event keyed by a client-generated UUID; replaying it must never produce a second rental.
- Time-based rules read `occurredAt`, never receipt time. Late fees and "too early" checks are computed from when it happened.
- The queue is capped at 500 events; beyond that the UI **blocks new scans** with a visible warning rather than dropping them silently.
- Staff may not move a bike from `unavailable` to `available`; that transition is rejected with a role error.
- Nothing in this app crosses outlets, and there is no renter-initiated action anywhere in it.
- Renter phone numbers appear masked only.
- Touch targets are at least 44 x 44 CSS px.
- The PWA is installable and precaches its app shell; on a repeat visit it must load and accept scans with the network disabled.

**Undecided — record, never invent.**

- **Scanner hardware** — handheld phone versus counter-docked device versus both. No device is chosen, so no layout may assume one; the shape must adapt.
- The threshold, timing and wording of the near-cap queue warning are not set.
- The SRS configuration parameters that drive this app — checklist length, minimum and maximum photo counts, late grace minutes, escalation minutes — are still business decisions. The app must read them from server config rather than hard-code them.

## Brand Commitments

- **Kayooh** — the same name as the renter app, a wordplay on the Indonesian *kayuh*, "to pedal". This app has no separate identity.
- No logo, palette, typeface or icon set exists. The name is the only binding asset.
- User-facing copy is **Bahasa Indonesia**; code identifiers and comments stay English.

## Evidence on Hand

- **Real:** the event contract and staff endpoints in the SRS, the bike state machine, the custody rules, and the PWA shell (service-worker precache, installable manifest, install prompt).
- **Absent:** no device selection, no logo, no photography, no PWA icon set. Nothing visual may be fabricated to fill this.
- **Scaffold gap:** unlike `apps/web`, this app currently carries no styling dependency, while the SRS asks both to follow the Tailwind and shadcn/ui patterns.

## Product Principles

1. **The scan is the only thing that moves a bike.**
2. **Record when it happened, sync when you can.** `occurredAt` is the truth, not arrival time.
3. **Never block a handover on the network.**
4. **Flag, never silently drop.** A questionable event is recorded and surfaced, not discarded.
5. **One-handed, standing up, renter waiting.** Every extra tap is a cost paid by someone holding a bicycle.

## Accessibility & Inclusion

- Touch targets at least 44 x 44 CSS px, sized for gloved or hurried hands.
- Must function at the outlet's real connectivity — including none — without losing data.
- Interface in Bahasa Indonesia with IDR and WIB conventions.
