ALTER TABLE "subscription_item_features" ALTER COLUMN "product_feature_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ADD COLUMN "detached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ADD COLUMN "detached_reason" text;--> statement-breakpoint
DROP POLICY "Ensure organization integrity with product_features parent table" ON "subscription_item_features" CASCADE;