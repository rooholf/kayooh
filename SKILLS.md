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