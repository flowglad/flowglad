CREATE TYPE "UsageMeterAggregationType" AS ENUM ('sum', 'count_distinct_properties');

ALTER TABLE "organizations" ALTER COLUMN "fee_percentage" SET DEFAULT '0.65';--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "usage_meter_id" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "price_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "properties" jsonb;--> statement-breakpoint
ALTER TABLE "usage_meters" ADD COLUMN "aggregation_type" "UsageMeterAggregationType" DEFAULT 'sum' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prices_usage_meter_id_idx" ON "prices" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_price_id_idx" ON "usage_events" USING btree ("price_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_subject_id_idx" ON "usage_events" USING btree ("subject_id");--> statement-breakpoint
CREATE POLICY "On insert, ensure usage meter belongs to same organization as product" ON "prices" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("usage_meter_id" IS NULL OR "usage_meter_id" IN (
  SELECT "id" FROM "usage_meters" 
  WHERE "usage_meters"."organization_id" = (
    SELECT "organization_id" FROM "products" 
    WHERE "products"."id" = "product_id"
  )
));--> statement-breakpoint
CREATE POLICY "On update, ensure usage meter belongs to same organization as product" ON "prices" AS PERMISSIVE FOR UPDATE TO "authenticated" WITH CHECK ("usage_meter_id" IS NULL OR "usage_meter_id" IN (
  SELECT "id" FROM "usage_meters" 
  WHERE "usage_meters"."organization_id" = (
    SELECT "organization_id" FROM "products" 
    WHERE "products"."id" = "product_id"
  )
));--> statement-breakpoint
CREATE POLICY "On insert, only allow usage events for prices with matching usage meter" ON "usage_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("price_id" in (select "id" from "prices" where "prices"."usage_meter_id" = "usage_meter_id"));--> statement-breakpoint
CREATE POLICY "On update, only allow usage events for prices with matching usage meter" ON "usage_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("price_id" in (select "id" from "prices" where "prices"."usage_meter_id" = "usage_meter_id"));