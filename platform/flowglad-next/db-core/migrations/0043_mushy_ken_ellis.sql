DROP INDEX IF EXISTS "Users_calEventId_idx";--> statement-breakpoint
ALTER TABLE "Memberships" ADD COLUMN "calAPIKey" text;--> statement-breakpoint
ALTER TABLE "Memberships" ADD COLUMN "calEventTypeId" integer;--> statement-breakpoint
ALTER TABLE "Memberships" ADD COLUMN "calWebhookSecret" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Memberships_calEventTypeId_idx" ON "Memberships" USING btree ("calEventTypeId");--> statement-breakpoint
ALTER TABLE "Users" DROP COLUMN IF EXISTS "calAPIKey";--> statement-breakpoint
ALTER TABLE "Users" DROP COLUMN IF EXISTS "calEventId";--> statement-breakpoint
ALTER TABLE "Users" DROP COLUMN IF EXISTS "calWebhookSecret";