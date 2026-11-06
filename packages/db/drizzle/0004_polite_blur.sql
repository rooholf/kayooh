CREATE TYPE "public"."pricing_day_type" AS ENUM('all', 'weekday', 'weekend');--> statement-breakpoint
ALTER TABLE "deposit_claims" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deposits" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "deposit_claims" CASCADE;--> statement-breakpoint
DROP TABLE "deposits" CASCADE;--> statement-breakpoint
DROP INDEX "rentals_reservation_uq";--> statement-breakpoint
DROP INDEX "pricing_rules_lookup_idx";--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD COLUMN "day_type" "pricing_day_type" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "quantity" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "dp_idr" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "rentals_reservation_idx" ON "rentals" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "pricing_rules_lookup_idx" ON "pricing_rules" USING btree ("outlet_id","category","day_type","effective_from");--> statement-breakpoint
ALTER TABLE "renters" DROP COLUMN "deposit_status";--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_quantity_check" CHECK (quantity >= 1);--> statement-breakpoint
ALTER TABLE "public"."payment_intents" ALTER COLUMN "purpose" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."payment_purpose";--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('booking', 'late_fee');--> statement-breakpoint
ALTER TABLE "public"."payment_intents" ALTER COLUMN "purpose" SET DATA TYPE "public"."payment_purpose" USING "purpose"::"public"."payment_purpose";--> statement-breakpoint
ALTER TABLE "public"."refunds" ALTER COLUMN "reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."refund_reason";--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('mechanical_failure', 'reallocation_declined', 'late_payment_sold_out', 'no_show', 'dispute');--> statement-breakpoint
ALTER TABLE "public"."refunds" ALTER COLUMN "reason" SET DATA TYPE "public"."refund_reason" USING "reason"::"public"."refund_reason";--> statement-breakpoint
DROP TYPE "public"."deposit_status";