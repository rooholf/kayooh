# Jambi Bike Rental Network

White-labeled, headless booking engine for individual bike-rental owners. An owner drops a single direct link
(keyed by their outlet code, e.g. `https://<host>/<outletCode>`) into their social-media bio; a renter who taps it
lands on that owner's own booking page, picks a bike category, time window and quantity, pays a 50% down payment,
collects the bike at the staffed outlet via QR scan, and returns it to a staffed outlet of the same owner. There is
no multi-outlet discovery map as the primary renter surface. Owners get fleet visibility and weekly financial
statements; admins onboard owners, set pricing and promotions, run settlements and resolve disputes.

## Design rules

1. **Station-to-station only** — every bike always has a home/current outlet and a custody state.
2. **Booking-to-inventory lock** — the server, inside a DB transaction, is the only source of availability.
3. **No dockless rentals** — no GPS, no bike map; a rental ends only through a staff scan-in.
4. **Direct, outlet-specific entry** — renters arrive via an owner's bio link (`/<outletCode>`), not a global outlet browser (revision 1.3).

## Stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript (strict) |
| Repo | pnpm workspaces + Turborepo |
| API | Node.js + Fastify + Zod (`/api/v1`) |
| Database | PostgreSQL 16+ with Drizzle ORM |
| Jobs | Redis + BullMQ |
| Web | Next.js, Tailwind, shadcn/ui, TanStack Query |
| Staff app | Vite + React PWA, Dexie, Workbox |
| Auth | Better Auth |
| Payments | Xendit |

## Repository layout

```
.
├─ apps/
│  ├─ api/            Fastify modular monolith (modules/, jobs/, plugins/)
│  ├─ web/            Next.js: (renter)/, (owner)/, (admin)/ route groups
│  └─ staff/          Vite + React PWA for outlet counters
├─ packages/
│  ├─ db/             Drizzle schema, migrations, SQL helpers
│  ├─ contracts/      Zod schemas and shared TypeScript types
│  └─ config/         tsconfig, eslint and tailwind presets
└─ turbo.json
```

## Prerequisites

- Node.js 20+ (Active LTS)
- pnpm 9+ (`corepack enable`)
- PostgreSQL 16+ and Redis (local or managed)

## Getting started

```bash
corepack enable
pnpm install
pnpm dev
```

## Common scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run all apps in watch mode |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Lint the workspace |
| `pnpm typecheck` | Type-check the workspace |
| `pnpm test` | Run the test suites |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations |

## Branching and PR conventions (AGENTS.md §8)

- `staging` is the integration branch: every issue-fix branch — local or created by an OpenCode GitHub-Action run (`opencode.yml`, `opencode-triage.yml`, `opencode-roadmap-audit.yml`) — branches from `staging` and its PR targets `staging`.
- `main` is promotion-only: it never takes feature work directly. `.github/workflows/sync-main.yml` opens a fast-forward `staging` → `main` PR whenever staging is ahead; merge it after the NFR-09 gates pass on staging.
- If a PR ever lands on `main` by mistake, merge `main` → `staging` (fast-forward when possible) before the next PR and log the exception in the PR body.

## Environment

Create a `.env` at the repository root (or per app) with at least:

```
DATABASE_URL=postgres://user:password@localhost:5432/jambi
REDIS_URL=redis://localhost:6379
```

## Roadmap

- **Phase 1 (launch):** all four outlets as white-labeled direct booking pages (`/<outletCode>`), reservation lock, staff scanning, payments, basic dashboard.
- **Phase 2:** weekly statements, promotions engine, performance reports.
- **Phase 3:** sister-outlet groups, e-bike category, optional Capacitor wrapper.
