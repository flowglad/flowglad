ALTER TABLE "variants" RENAME TO "prices";--> statement-breakpoint
ALTER TABLE "checkout_sessions" RENAME COLUMN "variant_id" TO "price_id";--> statement-breakpoint
ALTER TABLE "fee_calculations" RENAME COLUMN "variant_id" TO "price_id";--> statement-breakpoint
ALTER TABLE "invoice_line_items" RENAME COLUMN "variant_id" TO "price_id";--> statement-breakpoint
ALTER TABLE "purchases" RENAME COLUMN "variant_id" TO "price_id";--> statement-breakpoint
ALTER TABLE "subscription_items" RENAME COLUMN "variant_id" TO "price_id";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "variant_id" TO "price_id";--> statement-breakpoint
ALTER TABLE "prices" RENAME COLUMN "price_type" TO "type";--> statement-breakpoint
ALTER TABLE "prices" DROP CONSTRAINT "variants_id_unique";--> statement-breakpoint
ALTER TABLE "prices" DROP CONSTRAINT "variants_stripe_price_id_unique";--> statement-breakpoint
ALTER TABLE "checkout_sessions" DROP CONSTRAINT "checkout_sessions_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_calculations" DROP CONSTRAINT "fee_calculations_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP CONSTRAINT "invoice_line_items_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_items" DROP CONSTRAINT "subscription_items_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "prices" DROP CONSTRAINT "variants_product_id_products_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "checkout_sessions_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "invoice_line_items_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "purchases_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "subscription_items_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "subscriptions_variant_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "variants_price_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "variants_product_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "variants_stripe_price_id_unique_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_calculations" ADD CONSTRAINT "fee_calculations_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_sessions_price_id_idx" ON "checkout_sessions" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_price_id_idx" ON "invoice_line_items" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_price_id_idx" ON "purchases" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_items_price_id_idx" ON "subscription_items" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_price_id_idx" ON "subscriptions" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prices_type_idx" ON "prices" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prices_product_id_idx" ON "prices" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prices_stripe_price_id_unique_idx" ON "prices" USING btree ("stripe_price_id");--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_stripe_price_id_unique" UNIQUE("stripe_price_id");

DO $$ BEGIN
  ALTER TYPE "FeeCalculationType" ADD VALUE 'checkout_session_payment';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "PurchaseAccessSessionSource" ADD VALUE 'checkout_session';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
