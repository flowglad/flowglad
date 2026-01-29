ALTER TABLE "usage_meters" DROP CONSTRAINT "usage_meters_product_id_products_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "usage_meters_product_id_idx";--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD COLUMN "fully_redeemed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "subscription_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_subscription_id_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
DROP POLICY "On insert, ensure usage meter belongs to same organization as product" ON "prices" CASCADE;--> statement-breakpoint
ALTER POLICY "On update, ensure usage meter belongs to same organization as product" ON "prices" TO authenticated WITH CHECK ("usage_meter_id" IS NULL OR "usage_meter_id" IN (
  SELECT "id" FROM "usage_meters"
  WHERE "usage_meters"."organization_id" = (
    SELECT "organization_id" FROM "products" 
    WHERE "products"."id" = "prices"."product_id"
  )
));
ALTER TABLE "usage_meters" DROP COLUMN IF EXISTS "product_id";--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN "failure_message" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_code" text;
ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "target_subscription_id" text;