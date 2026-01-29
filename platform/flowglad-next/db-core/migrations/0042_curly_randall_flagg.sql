ALTER TABLE "Users" ADD COLUMN "calAPIKey" text;--> statement-breakpoint
ALTER TABLE "Users" ADD COLUMN "calEventId" integer;--> statement-breakpoint
ALTER TABLE "Users" ADD COLUMN "calWebhookSecret" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Users_calEventId_idx" ON "Users" USING btree ("calEventId");