CREATE TYPE "public"."ledger_type" AS ENUM('rental_revenue', 'platform_commission', 'promo_share', 'late_fee_share', 'refund_reversal', 'damage_claim_credit', 'manual_adjustment', 'payout');--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"rate_bps" integer NOT NULL,
	"base" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_rules_rate_bps_check" CHECK (rate_bps >= 0 AND rate_bps <= 10000),
	CONSTRAINT "commission_rules_base_check" CHECK (base IN ('pre_discount','post_discount'))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"outlet_id" uuid,
	"rental_id" uuid,
	"type" "ledger_type" NOT NULL,
	"amount_idr" bigint NOT NULL,
	"group_id" uuid NOT NULL,
	"week_key" text NOT NULL,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_rules_owner_effective_idx" ON "commission_rules" USING btree ("owner_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_rental_type_uq" ON "ledger_entries" USING btree ("rental_id","type");--> statement-breakpoint
CREATE INDEX "ledger_entries_owner_week_idx" ON "ledger_entries" USING btree ("owner_id","week_key");--> statement-breakpoint
CREATE INDEX "ledger_entries_group_idx" ON "ledger_entries" USING btree ("group_id");
--> statement-breakpoint
-- Phase 2 RLS + INV-6 append-only guard for ledger_entries (FR-LED-01, SRS §5).
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS owner_isolation ON ledger_entries;
--> statement-breakpoint
CREATE POLICY owner_isolation ON ledger_entries
TO app_rls
USING (owner_id = current_setting('app.owner_id')::uuid)
WITH CHECK (owner_id = current_setting('app.owner_id')::uuid);
--> statement-breakpoint
DROP TRIGGER IF EXISTS ledger_entries_no_update ON ledger_entries;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS ledger_entries_no_delete ON ledger_entries;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
