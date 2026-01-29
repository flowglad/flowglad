ALTER TABLE "Integrations" RENAME COLUMN "service" TO "provider";--> statement-breakpoint
DROP INDEX IF EXISTS "Integrations_service_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Integrations_provider_idx" ON "Integrations" USING btree ("provider");