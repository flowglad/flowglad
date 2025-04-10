DROP INDEX IF EXISTS "usage_meters_organization_id_name_unique_idx";--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD COLUMN "subscription_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discount_redemptions_subscription_id_idx" ON "discount_redemptions" USING btree ("subscription_id");