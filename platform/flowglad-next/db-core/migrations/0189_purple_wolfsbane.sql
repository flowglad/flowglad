ALTER TABLE "subscriptions" ALTER COLUMN "price_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prices_external_id_product_id_unique_idx" ON "prices" USING btree ("external_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_external_id_unique_idx" ON "products" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_items_external_id_unique_idx" ON "subscription_items" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_external_id_organization_id_unique_idx" ON "subscriptions" USING btree ("external_id","organization_id");