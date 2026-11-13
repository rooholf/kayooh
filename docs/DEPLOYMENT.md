# Production deployment (free tier)

This platform is a modular monolith: one Fastify API, one Next.js web app, one
static staff PWA, plus PostgreSQL and Redis. It needs **always-on** processes for
the API, worker and sweeper, so a single free VPS is the recommended first
production target. Managed free tiers are listed as an alternative.

## Recommended: one free VPS + Docker Compose (always-on)

Best free options (no cost, credit card sometimes required for signup only):

- **Oracle Cloud Always Free**: 4 ARM OCPU / 24 GB RAM / 200 GB disk, free
  forever. Enough to run the whole stack.
- **Google Cloud e2-micro**: 1 vCPU / 1 GB RAM, free in us-central1 etc.
  Tighter on RAM; fine for a pilot.
- **AWS EC2 t4g.micro / t2.micro**: 12-month free tier only.

### Steps

1. Create the VM (Ubuntu 22.04/24.04), open ports 80 and 443 in the cloud
   firewall and the OS firewall.
2. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```
3. Point your domain's DNS at the VM IP:
   - `yourdomain.com`        -> VM IP (web)
   - `api.yourdomain.com`    -> VM IP (API)
   - `staff.yourdomain.com`  -> VM IP (staff PWA)
4. Clone the repo on the VM, then:
   ```bash
   cd deploy
   cp .env.example .env
   # fill in secrets; generate the voucher key:
   node ../apps/api/scripts/voucher-keygen.mjs k1
   # paste the printed VOUCHER_ED25519_SECRET_KEY + VOUCHER_KID into .env
   # paste the printed JWKS entry into ../apps/staff/src/lib/voucher-jwks.json
   # rebuild staff after that (or do it locally and commit first).
   docker compose up -d --build
   ```
5. Run database migrations once:
   ```bash
   docker compose exec api sh -c "cd /app/packages/db && npx drizzle-kit migrate"
   ```
   (Or run `pnpm db:migrate` locally against the production DATABASE_URL.)
6. Seed initial data if needed (outlets, bikes, admin user) using the dev seed
   endpoints or `packages/db/seed.ts`.
7. Verify:
   - `https://yourdomain.com` loads the web app.
   - `https://api.yourdomain.com/healthz` returns `{"status":"ok"}`.
   - `https://staff.yourdomain.com` loads the installable PWA.

Caddy (in the compose file) provisions and renews Let's Encrypt certificates
automatically for all three hosts.

### Day-2 operations

- Logs: `docker compose logs -f api worker`
- Restart: `docker compose restart api worker`
- Update: `git pull && docker compose up -d --build`
- Backups: schedule `pg_dump` from the postgres container to object storage
  (e.g. `docker compose exec -T postgres pg_dump -U jambi jambi | gzip > backup.sql.gz`).

## Managed free-tier alternative (no VM)

If you do not want to run a VM, split the stack across free managed services.
Expect cold starts and command limits; this is a pilot-grade setup.

| Component | Free service | Notes |
|---|---|---|
| Web (Next.js) | Vercel Hobby | Set root directory to `apps/web`; set `API_BASE_URL` + `NEXT_PUBLIC_API_BASE_URL`. |
| Staff PWA (static) | Vercel or Cloudflare Pages | Build command `pnpm --filter @repo/staff build`, output `apps/staff/dist`. Set `VITE_API_BASE=https://api.yourdomain.com/api/v1` at build time. |
| API (Fastify) | Render Free Web Service or Koyeb Free | Build `pnpm install && pnpm --filter @repo/api build`; start `node apps/api/dist/index.js`. Sleeps on free tiers unless pinged. |
| Worker | Render Free Background Worker (or same container) | Start `node apps/api/dist/worker.js`. Needs Redis. |
| PostgreSQL | Neon Free (0.5 GB) | Use the pooled connection string as `DATABASE_URL`. |
| Redis | Redis Cloud Free (30 MB) or Upstash | BullMQ needs a real Redis; Upstash free has daily command limits. |

Recommended env wiring for the managed split:

- Web on Vercel: `API_BASE_URL=https://api.yourdomain.com` (server-side pipe) and
  `NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com` (public catalog calls).
- Staff build: `VITE_API_BASE=https://api.yourdomain.com/api/v1`.
- API: `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `PAYMENT_WEBHOOK_SECRET`,
  `VOUCHER_ED25519_SECRET_KEY`, `VOUCHER_KID`.
- Point `yourdomain.com`, `api.yourdomain.com`, `staff.yourdomain.com` at the
  respective services; each provider issues HTTPS automatically.

## Required secrets checklist

- `BETTER_AUTH_SECRET` — 32+ random chars.
- `PAYMENT_WEBHOOK_SECRET` — from the Xendit dashboard callback token.
- `VOUCHER_ED25519_SECRET_KEY` + `VOUCHER_KID` — from `voucher-keygen.mjs`.
- Matching `apps/staff/src/lib/voucher-jwks.json` public key for the staff
  offline pre-check.
- Tag HMAC envs if you use bike-tag pre-checks.

## Known production caveats

- The API's dev-only routes are no-ops when `NODE_ENV=production`.
- `DEV_LOG_OTP=true` is rejected in production by `loadEnv`.
- Redis is optional but strongly recommended: without it the sweeper/outbox run
  only if something external calls `runSweeper()` / `runOutboxDispatch()`.
- Neon/Upstash free tiers sleep or rate-limit; the VPS route avoids this.
- Run migrations before first traffic and after each deploy that changes schema.
- Keep `main` promotion-only and land changes on `staging` first (AGENTS.md §8).