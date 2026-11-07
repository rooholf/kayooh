ALTER TABLE "id_document_views" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "id_document_views" CASCADE;--> statement-breakpoint
DROP TABLE "verification_requests" CASCADE;--> statement-breakpoint
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_key_user_id_pk";--> statement-breakpoint
ALTER TABLE "idempotency_keys" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "renters" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN "guest_phone" text;--> statement-breakpoint
CREATE UNIQUE INDEX "renters_phone_uq" ON "renters" USING btree ("phone");--> statement-breakpoint
ALTER TABLE "renters" DROP COLUMN "verification_status";--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_scope_uq" UNIQUE NULLS NOT DISTINCT("key","user_id","guest_phone");--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_scope_check" CHECK ((user_id IS NULL) <> (guest_phone IS NULL));--> statement-breakpoint
DROP TYPE "public"."verification_status";