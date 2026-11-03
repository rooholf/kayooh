# Jambi Bike Rental Network

Station-based, multi-owner bike rental aggregator for Jambi. Renters browse outlets,
reserve a bike category for a time window, pay, collect the bike from a staffed outlet
via QR scan, and return it to a staffed outlet of the same owner. Owners get fleet
visibility and weekly financial statements; admins onboard owners, set pricing and
promotions, run settlements and resolve disputes.

## Design rules

1. **Station-to-station only** — every bike always has a home/current outlet and a custody state.
2. **Booking-to-inventory lock** — the server, inside a DB transaction, is the only source of availability.
3. **No dockless rentals** — no GPS, no bike map; a rental ends only through a staff scan-in.

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

## Environment

Create a `.env` at the repository root (or per app) with at least:

```
DATABASE_URL=postgres://user:password@localhost:5432/jambi
REDIS_URL=redis://localhost:6379
```

## Roadmap

- **Phase 1 (launch):** all four outlets, reservation lock, staff scanning, payments, basic dashboard.
- **Phase 2:** weekly statements, promotions engine, performance reports.
- **Phase 3:** sister-outlet groups, e-bike category, optional Capacitor wrapper.
