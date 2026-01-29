DROP INDEX IF EXISTS "usage_events_subject_id_idx";--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN IF EXISTS "subject_id";