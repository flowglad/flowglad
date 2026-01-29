DROP INDEX IF EXISTS "Invoices_paymentIntentId_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_stripePaymentIntentId_idx" ON "Invoices" USING btree ("stripePaymentIntentId");--> statement-breakpoint
ALTER TABLE "Invoices" DROP COLUMN IF EXISTS "paymentIntentId";