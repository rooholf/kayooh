ALTER TABLE "rentals" ADD COLUMN "collateral" jsonb;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "balance_collected_idr" bigint;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "balance_method" text;