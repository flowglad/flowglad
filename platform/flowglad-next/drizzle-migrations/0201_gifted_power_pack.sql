ALTER TABLE "api_keys" ALTER COLUMN "unkey_id" SET NOT NULL;--> statement-breakpoint
-- ALTER TABLE "payments" ALTER COLUMN "payment_method" SET DATA TYPE "PaymentMethodType";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "expires_at";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "billing_interval";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "billing_interval_count";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "billing_anchor_date";