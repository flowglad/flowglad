ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_stripePaymentIntentId_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "Purchases_stripePaymentIntentId_unique_idx";--> statement-breakpoint
ALTER TABLE "Purchases" DROP COLUMN IF EXISTS "stripePaymentIntentId";