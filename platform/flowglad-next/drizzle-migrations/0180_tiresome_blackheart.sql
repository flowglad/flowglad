ALTER TABLE "prices" DROP CONSTRAINT "prices_stripe_price_id_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_stripe_product_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "prices_stripe_price_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "products_stripe_product_id_idx";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "feature_flags" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN IF EXISTS "stripe_price_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN IF EXISTS "stripe_product_id";