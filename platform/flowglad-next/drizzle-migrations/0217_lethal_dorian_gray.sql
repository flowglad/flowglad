DROP INDEX IF EXISTS "subscription_item_features_product_feature_id_subscription_item_id_unique_idx";--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "expired_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_item_features_feature_id_subscription_item_id_unique_idx" ON "subscription_item_features" USING btree ("feature_id","subscription_item_id");--> statement-breakpoint
ALTER POLICY "Enable all for self organizations via products" ON "prices" RENAME TO "Ensure organization integrity with products parent table";