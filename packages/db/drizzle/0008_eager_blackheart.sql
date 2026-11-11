ALTER TABLE "scan_events" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "scan_events" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_resolution_check" CHECK (resolution IN ('dismissed','corrected'));
