ALTER TABLE "subscription_item_features" ALTER COLUMN "product_feature_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ADD COLUMN "detached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ADD COLUMN "detached_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prices_product_id_is_default_unique_idx" ON "prices" USING btree ("product_id") WHERE "prices"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_catalog_id_default_unique_idx" ON "products" USING btree ("catalog_id") WHERE "products"."default";--> statement-breakpoint
DROP POLICY "Ensure organization integrity with product_features parent table" ON "subscription_item_features" CASCADE;