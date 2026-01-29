ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_stripeSetupIntentId_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "Purchases_stripeSetupIntentId_idx";--> statement-breakpoint
ALTER TABLE "Discounts" ADD COLUMN "stripeCouponId" text;--> statement-breakpoint
ALTER TABLE "Purchases" DROP COLUMN IF EXISTS "stripeSetupIntentId";