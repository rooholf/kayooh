-- ============================================================================
-- 0001_rls_and_guards.sql  —  RAW SQL MIGRATION (NFR-10)
--
-- Contents (cannot be expressed in the Drizzle schema, per SRS 2/FR-ID-03):
--   1. Database roles: `app_rls` (RLS enforced, NO BYPASSRLS) and
--      `app_service` (BYPASSRLS) — FR-ID-03 / SKILL setup_drizzle_rls_schema step 3.
--   2. Row-Level Security on all owner-scoped tables with the exact policy
--      USING (owner_id = current_setting('app.owner_id')::uuid)   [FR-ID-03]
--   3. INV-6 append-only triggers on:
--      bike_events, audit_log, id_document_views, scan_events,
--      payment_webhook_events
--
-- Owner context protocol: every owner-scoped transaction MUST first run
--   SELECT set_config('app.owner_id', <uuid>, true);
-- (apps/api repository helpers enforce this; compile-time ownerId parameters.)
-- ============================================================================

-- ------------------------------------------------------------------
-- 1. Roles
-- ------------------------------------------------------------------
-- IMPORTANT (SKILL step 3): BYPASSRLS is applied ONLY to app_service.
-- app_rls MUST NOT have BYPASSRLS — that is what enforces FR-ID-03 at the DB level.
-- BYPASSRLS is a superuser-only attribute: apply these statements with a
-- superuser connection (CI/test containers and managed-DB admin user do; the
-- runtime roles never need to run this migration themselves).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    CREATE ROLE app_service NOLOGIN NOSUPERUSER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    CREATE ROLE app_rls NOLOGIN NOSUPERUSER;
  END IF;
END $$;

ALTER ROLE app_service BYPASSRLS;
-- Negative guard: if any prior state gave app_rls BYPASSRLS, strip it.
ALTER ROLE app_rls NOBYPASSRLS;
ALTER ROLE app_rls NOLOGIN;
ALTER ROLE app_service NOLOGIN;

GRANT USAGE ON SCHEMA public TO app_rls, app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls, app_service;
-- Future tables (P2 ledger etc.) get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls, app_service;

-- ------------------------------------------------------------------
-- 2. Row-Level Security (FR-ID-03)
--    Policy per table, exactly: USING (owner_id = current_setting('app.owner_id')::uuid)
--    WITH CHECK mirrors USING so a row cannot be inserted/moved into a
--    foreign tenant (defense in depth alongside application authorization).
--    FORCE keeps out the nominal table owner from the migration connection;
--    app_service still bypasses RLS by role attribute (renter/staff/admin/system paths).
-- ------------------------------------------------------------------

-- outlet_categories carries the denormalized owner_id (A-18, see schema.ts).

DO $$
DECLARE
  t text;
  owner_scoped text[] := ARRAY[
    'outlets',
    'outlet_categories',
    'bikes',
    'bike_events',
    'reservations',
    'rentals'
  ];
BEGIN
  FOREACH t IN ARRAY owner_scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY owner_isolation ON %I
      TO app_rls
      USING (owner_id = current_setting('app.owner_id')::uuid)
      WITH CHECK (owner_id = current_setting('app.owner_id')::uuid)
    $f$, t);
  END LOOP;
END $$;

-- sister_groups / sister_group_outlets are owner-adjacent (owner_id present);
-- lock them the same way so enabling P3 cannot silently skip isolation.
ALTER TABLE sister_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE sister_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_isolation ON sister_groups;
CREATE POLICY owner_isolation ON sister_groups
TO app_rls
USING (owner_id = current_setting('app.owner_id')::uuid)
WITH CHECK (owner_id = current_setting('app.owner_id')::uuid);

ALTER TABLE sister_group_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sister_group_outlets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_isolation_via_group ON sister_group_outlets;
CREATE POLICY owner_isolation_via_group ON sister_group_outlets
TO app_rls
USING (EXISTS (SELECT 1 FROM sister_groups sg
               WHERE sg.id = sister_group_outlets.group_id
                 AND sg.owner_id = current_setting('app.owner_id')::uuid))
WITH CHECK (EXISTS (SELECT 1 FROM sister_groups sg
               WHERE sg.id = sister_group_outlets.group_id
                 AND sg.owner_id = current_setting('app.owner_id')::uuid));

-- ------------------------------------------------------------------
-- 3. INV-6 append-only triggers
--    UPDATE and DELETE raise an exception. Two narrow, audited gates exist:
--      - scan_events: only the resolution metadata columns may transition
--        (status, flag_reason, resolved_by, resolved_at) — FR-SEC-02 flagged-scan
--        resolution. Every other column is immutable.
--      - payment_webhook_events: only processed_at may transition (FR-PAY-02.3);
--        the raw payload is immutable forever.
--    Any attempt to alter the historical columns raises.
--    (Interpretation logged for the P2 ledger tables to copy the same pattern.)
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'INV-6 VIOLATION: % on %.append_only table is forbidden (%.% is historical/immutable)',
    TG_OP, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_TABLE_NAME, TG_OP;
END;
$$;

-- 3a. Strictly append-only tables: no UPDATE, no DELETE, ever.
DO $$
DECLARE
  t text;
  strict_append_only text[] := ARRAY[
    'bike_events',
    'audit_log',
    'id_document_views'
  ];
BEGIN
  FOREACH t IN ARRAY strict_append_only LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %s ON %I', t || '_no_update', t);
    EXECUTE format($f$
      CREATE TRIGGER %s BEFORE UPDATE ON %I FOR EACH ROW
      EXECUTE FUNCTION enforce_append_only()
    $f$, t || '_no_update', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %s ON %I', t || '_no_delete', t);
    EXECUTE format($f$
      CREATE TRIGGER %s BEFORE DELETE ON %I FOR EACH ROW
      EXECUTE FUNCTION enforce_append_only()
    $f$, t || '_no_delete', t);
  END LOOP;
END $$;

-- 3b. scan_events: DELETE rejected; UPDATE rejected unless ONLY the four
-- resolution columns moved (FR-SEC-02.2).
DROP TRIGGER IF EXISTS scan_events_no_delete ON scan_events;
CREATE TRIGGER scan_events_no_delete BEFORE DELETE ON scan_events FOR EACH ROW
  EXECUTE FUNCTION enforce_append_only();

DROP TRIGGER IF EXISTS scan_events_no_update ON scan_events;
-- Fires (raises) whenever ANY non-resolution column changes. Updates that
-- touch ONLY status/flag_reason/resolved_by/resolved_at pass (FR-SEC-02.2).
CREATE TRIGGER scan_events_no_update BEFORE UPDATE ON scan_events
FOR EACH ROW
WHEN (
  NOT (
    NEW.id              IS NOT DISTINCT FROM OLD.id
    AND NEW.client_event_id IS NOT DISTINCT FROM OLD.client_event_id
    AND NEW.staff_id    IS NOT DISTINCT FROM OLD.staff_id
    AND NEW.outlet_id   IS NOT DISTINCT FROM OLD.outlet_id
    AND NEW.type        IS NOT DISTINCT FROM OLD.type
    AND NEW.payload     IS NOT DISTINCT FROM OLD.payload
    AND NEW.occurred_at IS NOT DISTINCT FROM OLD.occurred_at
    AND NEW.received_at IS NOT DISTINCT FROM OLD.received_at
  )
)
EXECUTE FUNCTION enforce_append_only();

-- 3c. payment_webhook_events: DELETE rejected; UPDATE rejected unless ONLY
-- processed_at moved (FR-PAY-02.3).
DROP TRIGGER IF EXISTS payment_webhook_events_no_delete ON payment_webhook_events;
CREATE TRIGGER payment_webhook_events_no_delete BEFORE DELETE ON payment_webhook_events
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();

DROP TRIGGER IF EXISTS payment_webhook_events_no_update ON payment_webhook_events;
-- Fires (raises) whenever any immutable column changes; only processed_at
-- may transition (FR-PAY-02.3). The raw payload is immutable forever.
CREATE TRIGGER payment_webhook_events_no_update BEFORE UPDATE ON payment_webhook_events
FOR EACH ROW
WHEN (
  NEW.provider   IS DISTINCT FROM OLD.provider
  OR NEW.event_id    IS DISTINCT FROM OLD.event_id
  OR NEW.raw         IS DISTINCT FROM OLD.raw
  OR NEW.received_at IS DISTINCT FROM OLD.received_at
)
EXECUTE FUNCTION enforce_append_only();

-- ------------------------------------------------------------------
-- 4. Integrity helpers that must be guaranteed at the DB level
--    (raw SQL because they are behavioral, not structural)
-- ------------------------------------------------------------------

-- 4a. INV-1 hard floor: bike rows can never exist without full custody data.
ALTER TABLE bikes ALTER COLUMN home_outlet_id SET NOT NULL;
ALTER TABLE bikes ALTER COLUMN current_outlet_id SET NOT NULL;
ALTER TABLE bikes ALTER COLUMN state SET NOT NULL;

-- 4b. INV-4 hard floor: duplicate custody-trail rows for one bike at one
--     instant of one transition are impossible (exactly-one enforcement).
CREATE UNIQUE INDEX IF NOT EXISTS bike_events_transition_uq
  ON bike_events (bike_id, occurred_at, from_state, to_state, type);

-- 4c. Role-level timeout safety net; the API always sets lock_timeout = 3s
--     per transaction (NFR-02), this catches stragglers.
ALTER ROLE app_rls SET statement_timeout = '10s';

-- ------------------------------------------------------------------
-- 5. Verification notes for T-02 / T-08 / T-12 (SRS section 10)
--    T-02: connect as app_rls WITHOUT set_config -> every owner table returns
--          zero rows (policy USING never true) — no cross-tenant reads.
--    T-12: UPDATE/DELETE on strict tables -> exception 'INV-6 VIOLATION'.
--    T-08: information_schema introspection shows NO lat/lng/gps columns
--          outside `outlets` (schema.ts keeps it that way).
-- ------------------------------------------------------------------
