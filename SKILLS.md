# OpenCode Skills: Jambi Bike Rental Platform

Invoke these skills by name to execute standardized, repetitive workflows safely.

## `setup_drizzle_rls_schema`
1. Define the schema in `packages/db` using Drizzle[cite: 1].
2. Write a raw SQL migration to enable RLS using `USING (owner_id = current_setting('app.owner_id')::uuid)`[cite: 1].
3. Apply `BYPASSRLS` only to `app_service`, never to `app_rls`[cite: 1].

## `implement_zod_contract_route`
1. Define request/response schemas in `packages/contracts` with Zod `.strict()`[cite: 1].
2. Create the Fastify route in `apps/api/src/modules/<module>`[cite: 1].
3. Map Zod validation errors to 400 `VALIDATION_ERROR`[cite: 1].

## `build_transactional_inventory_lock`
1. Open a `READ COMMITTED` Postgres transaction[cite: 1].
2. Lock the `outlet_categories` row using `SELECT ... FOR UPDATE`[cite: 1].
3. Run `computeAvailability`. If available < 1, throw 409 `SOLD_OUT`[cite: 1].
4. Insert `reservations` and `payment_intents`, then emit an outbox event before committing[cite: 1].

## `implement_offline_staff_event`
1. Define the event payload schema based on the SRS (e.g., `checkout`, `checkin`)[cite: 1].
2. Write the component in `apps/staff` to store the event in Dexie with a `clientEventId` (UUIDv4) and `occurredAt` (UTC)[cite: 1].
3. Block new scans if the queue exceeds 500 events (FR-OFF-01)[cite: 1].

## `calculate_integer_money`
1. Fetch rates from `pricing_rules` or `commission_rules`[cite: 1].
2. Execute calculations using integer math (`bigint`) only[cite: 1].
3. Apply `roundHalfUp(n/d)` for commissions and `floor` for owner shares[cite: 1].

## `implement_redis_sse_stream`
1. Register the stream routes as Fastify endpoints replying `Content-Type: text/event-stream` and holding the connection open: `GET /api/v1/outlets/stream` (public, anonymous) and `GET /api/v1/owner/stream` (owner session)[cite: 1].
2. Publish to a Redis channel over the shared `ioredis` connection (`getRedisConnection`) after any commit that can change availability — reservation state, bike state, rental state[cite: 1].
3. Fan out with Redis pub/sub: each open client subscribes to the channel(s) it is allowed to see; never poll the database in the handler[cite: 1].
4. Filter the owner stream server-side by `owner_id`; a stream request without a session returns 401[cite: 1].
5. Emit `availability` `{outletId, category, availableNow}` (renter) and `rental` / `bike_state` (owner); send a heartbeat comment every 25 s; deliver within 2 s of commit (NFR-01)[cite: 1].

## `implement_transactional_outbox`
1. Inside the business transaction, insert the domain event row into the outbox table — never call the network or enqueue inside the transaction[cite: 1].
2. Commit first, then enqueue the delivery job (BullMQ) or let the drain loop pick up unpublished outbox rows[cite: 1].
3. Deliver the side effect idempotently keyed on the event (unique `(provider, event_id)` / consumer-dedup); mark the row published only after success[cite: 1].
4. A delivery/consumer failure MUST NOT roll back or block the business transaction (FR-NOT-01.4)[cite: 1].
5. Retry with exponential backoff — notifications: up to 5 attempts starting at 30 s, then set `failed` and write `audit_log` (FR-NOT-01.2)[cite: 1].

## `run_playwright_e2e`
1. Add the spec under `apps/web/e2e/<flow>.spec.ts`; run it against a seeded API on `:3001` and `next start` on `:3000` (Playwright config lives in `apps/web/playwright.config.ts`)[cite: 1].
2. Drive the full SRS flow end to end: a verified, funded renter books; deliver the Fake paid event; the staff app scans the voucher and bike; staff check-in; inspection `pass` (T-13)[cite: 1].
3. Assert the protected invariants in the browser: no bike ids/asset tags appear anywhere (NEG-2) and no coordinate query params are sent (NEG-4)[cite: 1].
4. Assert the terminal state: rental `completed`, bike `available`, availability restored[cite: 1].
5. Keep specs deterministic (fixed viewports, seeded data), capture screenshots for the visual record, and wire the suite into the blocking CI quality gate (NFR-09)[cite: 1].