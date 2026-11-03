CREATE TYPE "public"."bike_event_type" AS ENUM('registered', 'checked_out', 'checked_in', 'inspected', 'state_changed', 'incident_reported');--> statement-breakpoint
CREATE TYPE "public"."bike_state" AS ENUM('available', 'held', 'reserved', 'in_rental', 'pending_inspection', 'maintenance', 'unavailable', 'charging');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('none', 'pending', 'held', 'insufficient', 'released');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('booking', 'deposit', 'late_fee');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'paid', 'failed', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('mechanical_failure', 'reallocation_declined', 'late_payment_sold_out', 'no_show', 'dispute', 'deposit_release');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rental_status" AS ENUM('open', 'returned', 'completed');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('held', 'confirmed', 'fulfilled', 'expired', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('not_started', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bike_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bike_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" "bike_event_type" NOT NULL,
	"from_state" "bike_state",
	"to_state" "bike_state",
	"outlet_id" uuid NOT NULL,
	"staff_id" uuid,
	"rental_id" uuid,
	"client_event_id" uuid,
	"photo_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"asset_tag" text NOT NULL,
	"category" text NOT NULL,
	"home_outlet_id" uuid NOT NULL,
	"current_outlet_id" uuid NOT NULL,
	"state" "bike_state" DEFAULT 'available' NOT NULL,
	"attributes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"attributes_schema" jsonb
);
--> statement-breakpoint
CREATE TABLE "deposit_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_id" uuid NOT NULL,
	"renter_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"amount_idr" bigint NOT NULL,
	"description" text NOT NULL,
	"photo_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_claims_amount_positive_check" CHECK (amount_idr > 0),
	CONSTRAINT "deposit_claims_status_check" CHECK (status IN ('proposed','approved','rejected'))
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"renter_id" uuid NOT NULL,
	"balance_idr" bigint NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_balance_non_negative_check" CHECK (balance_idr >= 0),
	CONSTRAINT "deposits_status_check" CHECK (status IN ('pending','held','released'))
);
--> statement-breakpoint
CREATE TABLE "id_document_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_request_id" uuid NOT NULL,
	"viewer_id" uuid,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_drift_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected" jsonb NOT NULL,
	"reported" jsonb,
	"drift_pct" numeric(5, 2)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_channel_check" CHECK (channel IN ('whatsapp','email')),
	CONSTRAINT "notifications_status_check" CHECK (status IN ('queued','sent','failed'))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlet_categories" (
	"outlet_id" uuid NOT NULL,
	"category" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"safety_buffer" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "outlet_categories_outlet_id_category_pk" PRIMARY KEY("outlet_id","category"),
	CONSTRAINT "outlet_categories_buffer_check" CHECK (safety_buffer BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"address" text NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"hours" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outlets_status_check" CHECK (status IN ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bank_code" text,
	"bank_account_number" text,
	"bank_account_name" text,
	"promo_opt_out" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owners_status_check" CHECK (status IN ('active','suspended'))
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "payment_purpose" NOT NULL,
	"renter_id" uuid NOT NULL,
	"reservation_id" uuid,
	"rental_id" uuid,
	"amount_idr" bigint NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"gateway" text DEFAULT 'xendit' NOT NULL,
	"gateway_ref" text,
	"payment_url" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_amount_positive_check" CHECK (amount_idr > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"raw" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"category" text NOT NULL,
	"rate_idr" bigint NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_rules_rate_positive_check" CHECK (rate_idr > 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"reservation_id" uuid,
	"rental_id" uuid,
	"amount_idr" bigint NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"gateway_ref" text,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive_check" CHECK (amount_idr > 0)
);
--> statement-breakpoint
CREATE TABLE "rentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"renter_id" uuid NOT NULL,
	"bike_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"checkout_outlet_id" uuid NOT NULL,
	"checked_out_at" timestamp with time zone NOT NULL,
	"expected_end_at" timestamp with time zone NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checkin_outlet_id" uuid,
	"status" "rental_status" DEFAULT 'open' NOT NULL,
	"late_minutes" integer,
	"late_fee_idr" bigint DEFAULT 0 NOT NULL,
	"mechanical_failure" boolean DEFAULT false NOT NULL,
	"escalation_stage" smallint DEFAULT 0 NOT NULL,
	"checkout_checklist" jsonb NOT NULL,
	"checkin_checklist" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rentals_escalation_stage_check" CHECK (escalation_stage BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "renters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text,
	"verification_status" "verification_status" DEFAULT 'not_started' NOT NULL,
	"deposit_status" "deposit_status" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"renter_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"category" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "reservation_status" DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"price_idr" bigint NOT NULL,
	"discount_idr" bigint DEFAULT 0 NOT NULL,
	"final_idr" bigint NOT NULL,
	"promo_id" uuid,
	"owner_promo_bps" integer NOT NULL,
	"rate_snapshot" jsonb NOT NULL,
	"at_risk" boolean DEFAULT false NOT NULL,
	"reallocation_deadline_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_window_check" CHECK (ends_at > starts_at)
);
--> statement-breakpoint
CREATE TABLE "scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_event_id" uuid NOT NULL,
	"staff_id" uuid,
	"outlet_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"flag_reason" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "scan_events_status_check" CHECK (status IN ('applied','flagged','rejected'))
);
--> statement-breakpoint
CREATE TABLE "sister_group_outlets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sister_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text NOT NULL,
	"owner_id" uuid,
	"outlet_id" uuid,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK (role IN ('renter','staff','owner','admin')),
	CONSTRAINT "users_staff_requires_outlet_check" CHECK ((role <> 'staff') OR (outlet_id IS NOT NULL)),
	CONSTRAINT "users_owner_requires_owner_check" CHECK ((role <> 'owner') OR (owner_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"renter_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"document_type" text NOT NULL,
	"document_key" text,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_requests_doc_type_check" CHECK (document_type IN ('ktp','sim','passport'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_events" ADD CONSTRAINT "bike_events_bike_id_bikes_id_fk" FOREIGN KEY ("bike_id") REFERENCES "public"."bikes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_events" ADD CONSTRAINT "bike_events_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_events" ADD CONSTRAINT "bike_events_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_events" ADD CONSTRAINT "bike_events_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bike_events" ADD CONSTRAINT "bike_events_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bikes" ADD CONSTRAINT "bikes_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bikes" ADD CONSTRAINT "bikes_category_categories_code_fk" FOREIGN KEY ("category") REFERENCES "public"."categories"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bikes" ADD CONSTRAINT "bikes_home_outlet_id_outlets_id_fk" FOREIGN KEY ("home_outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bikes" ADD CONSTRAINT "bikes_current_outlet_id_outlets_id_fk" FOREIGN KEY ("current_outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_claims" ADD CONSTRAINT "deposit_claims_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_claims" ADD CONSTRAINT "deposit_claims_renter_id_renters_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_claims" ADD CONSTRAINT "deposit_claims_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_claims" ADD CONSTRAINT "deposit_claims_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_renter_id_renters_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_document_views" ADD CONSTRAINT "id_document_views_verification_request_id_verification_requests_id_fk" FOREIGN KEY ("verification_request_id") REFERENCES "public"."verification_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_document_views" ADD CONSTRAINT "id_document_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_drift_checks" ADD CONSTRAINT "inventory_drift_checks_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_categories" ADD CONSTRAINT "outlet_categories_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_categories" ADD CONSTRAINT "outlet_categories_category_categories_code_fk" FOREIGN KEY ("category") REFERENCES "public"."categories"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_categories" ADD CONSTRAINT "outlet_categories_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_renter_id_renters_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_category_categories_code_fk" FOREIGN KEY ("category") REFERENCES "public"."categories"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_renter_id_renters_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_bike_id_bikes_id_fk" FOREIGN KEY ("bike_id") REFERENCES "public"."bikes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_checkout_outlet_id_outlets_id_fk" FOREIGN KEY ("checkout_outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_checkin_outlet_id_outlets_id_fk" FOREIGN KEY ("checkin_outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renters" ADD CONSTRAINT "renters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_renter_id_renters_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_category_categories_code_fk" FOREIGN KEY ("category") REFERENCES "public"."categories"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sister_group_outlets" ADD CONSTRAINT "sister_group_outlets_group_id_sister_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."sister_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sister_group_outlets" ADD CONSTRAINT "sister_group_outlets_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sister_groups" ADD CONSTRAINT "sister_groups_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_renter_id_renters_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bike_events_client_event_id_uq" ON "bike_events" USING btree ("client_event_id");--> statement-breakpoint
CREATE INDEX "bike_events_bike_occurred_idx" ON "bike_events" USING btree ("bike_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bikes_asset_tag_uq" ON "bikes" USING btree ("asset_tag");--> statement-breakpoint
CREATE INDEX "bikes_home_outlet_cat_state_idx" ON "bikes" USING btree ("home_outlet_id","category","state");--> statement-breakpoint
CREATE INDEX "deposit_claims_owner_status_idx" ON "deposit_claims" USING btree ("owner_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_renter_id_uq" ON "deposits" USING btree ("renter_id");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_undispatched_idx" ON "outbox_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outlets_code_uq" ON "outlets" USING btree ("code");--> statement-breakpoint
CREATE INDEX "payment_intents_reservation_idx" ON "payment_intents" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "payment_intents_rental_idx" ON "payment_intents" USING btree ("rental_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_uq" ON "payment_webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "pricing_rules_lookup_idx" ON "pricing_rules" USING btree ("outlet_id","category","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "rentals_reservation_uq" ON "rentals" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rentals_one_open_per_bike_uq" ON "rentals" USING btree ("bike_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "rentals_owner_status_idx" ON "rentals" USING btree ("owner_id","status","created_at");--> statement-breakpoint
CREATE INDEX "rentals_bike_idx" ON "rentals" USING btree ("bike_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "renters_user_id_uq" ON "renters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reservations_window_idx" ON "reservations" USING btree ("outlet_id","category","status","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "reservations_renter_idx" ON "reservations" USING btree ("renter_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_events_client_event_id_uq" ON "scan_events" USING btree ("client_event_id");--> statement-breakpoint
CREATE INDEX "scan_events_outlet_status_idx" ON "scan_events" USING btree ("outlet_id","status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sister_group_outlets_pair_uq" ON "sister_group_outlets" USING btree ("group_id","outlet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "verification_requests_status_idx" ON "verification_requests" USING btree ("status","created_at");