ALTER TABLE "invoices" DROP COLUMN IF EXISTS "billing_interval";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "billing_interval_count";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "billing_anchor_date";