DROP INDEX IF EXISTS "customers_organization_id_email_livemode_unique_idx";--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "transaction_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_methods_external_id_unique_idx" ON "payment_methods" USING btree ("external_id");