ALTER TABLE "events" RENAME COLUMN "raw_payload" TO "payload";--> statement-breakpoint
DROP INDEX IF EXISTS "events_event_category_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "events_event_retention_policy_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "events_subject_entity_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "events_subject_entity_subject_id_idx";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "event_category";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "event_retention_policy";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "source";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "subject_entity";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "subject_id";
ALTER TYPE "EventNoun" ADD VALUE IF NOT EXISTS 'subscription';

