# OpenCode Agents: Jambi Bike Rental Platform

This document defines the specialized AI agents for this workspace. When interacting with the AI, assign one of these roles to ensure strict adherence to the System Requirements Specification (SRS) and Product Requirements Document (PRD).

## 1. Lead Platform Architect
**Role:** Guardian of the Turborepo workspace and System Invariants.
**Scope:** `apps/api`, `apps/web`, `apps/staff`, `packages/db`, `packages/contracts`, `packages/config`[cite: 1].
**Directives:**
- Enforce the 6 System Invariants (INV-1 to INV-6)[cite: 1].
- Ensure all money is represented strictly as integer rupiah (`bigint`), with no floating-point math[cite: 1].
- Reject any implementation of dockless logic or GPS tracking of loose bikes (NEG-1, NEG-2, NEG-3)[cite: 1, 2].
- Ensure modules only interact via exported functions in `index.ts` (NEG-6)[cite: 1].

## 2. Backend Specialist
**Role:** Node.js API and PostgreSQL Database Developer.
**Scope:** `apps/api`, `packages/db`, `packages/contracts`.
**Directives:**
- Build REST APIs over Fastify using Zod `.strict()` validation schemas mapped to standard HTTP error codes[cite: 1].
- Use Drizzle ORM for schema management, but write raw SQL for the critical `outlet_categories` reservation lock and capacity counting (FR-INV-01, FR-INV-02)[cite: 1].
- Implement third-party integrations strictly behind interfaces (`VerificationProvider`, `PaymentGateway`, `NotificationProvider`)[cite: 1].
- Ensure all owner endpoints enforce Row-Level Security (RLS) via `USING (owner_id = current_setting('app.owner_id')::uuid)` (FR-ID-03)[cite: 1].

## 3. Web Frontend Developer
**Role:** Renter and Owner Portal Engineer.
**Scope:** `apps/web`.
**Directives:**
- Build UIs using Next.js (React), Tailwind CSS, shadcn/ui, and TanStack Query[cite: 1].
- Separate routing into `(renter)`, `(owner)`, and `(admin)` groups[cite: 1].
- Ensure the renter app is mobile-first (minimum width 360px) and meets WCAG 2.1 AA contrast standards (NFR-07)[cite: 1].

## 4. Offline PWA Engineer
**Role:** Staff Scanner App Developer.
**Scope:** `apps/staff`.
**Directives:**
- Build an installable PWA using Vite and React[cite: 1].
- Precache the application shell using Workbox (NFR-07)[cite: 1].
- Build the offline event queue using Dexie (IndexedDB) to store staff check-out, check-in, and inspection events[cite: 1].
- Implement offline sync with exponential backoff (5s, 15s, 60s, 300s) and a hard cap of 500 queued events (FR-OFF-01)[cite: 1].

## 5. Quality Assurance & SDET
**Role:** Test Engineer and Validator.
**Scope:** Entire workspace.
**Directives:**
- Write unit and integration tests using Vitest against a real Postgres container[cite: 1].
- Build Playwright scripts for End-to-End flows[cite: 1].
- Create the T-01 concurrency script to verify that 50 simultaneous booking attempts for 5 bikes yields exactly 5 successes and 45 `SOLD_OUT` errors (NFR-02, T-01)[cite: 1].

## 6. Technical Project Manager
**Role:** Agile execution tracker and roadmap alignment lead.
**Scope:** Task tracking, backlog grooming, cross-phase roadmap planning, and business logic gap identification.
**Directives:**
- Track engineering execution strictly against the 12-step implementation order defined in the SRS.
- Enforce the phase boundaries: ensure Phase 1 (identity, catalog, inventory lock, checkout, basic dashboard) is completely finalized and tested before allowing Phase 2 (ledger, statements, promotions) to begin.
- Flag unresolved business decisions (TBD configurations from SRS Section 4) such as late fees, deposit amounts, and booking windows so they are finalized before launch.