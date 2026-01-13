DROP INDEX IF EXISTS "prices_external_id_product_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "prices_product_id_is_default_unique_idx";--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "prices" SET "is_default" = false WHERE "type" = 'usage';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prices_external_id_usage_meter_id_unique_idx" ON "prices" USING btree ("external_id","usage_meter_id") WHERE "prices"."type" = 'usage';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prices_usage_meter_is_default_unique_idx" ON "prices" USING btree ("usage_meter_id") WHERE "prices"."is_default" AND "prices"."type" = 'usage';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prices_external_id_product_id_unique_idx" ON "prices" USING btree ("external_id","product_id") WHERE "prices"."type" != 'usage';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prices_product_id_is_default_unique_idx" ON "prices" USING btree ("product_id") WHERE "prices"."is_default" AND "prices"."type" != 'usage';--> statement-breakpoint
DROP POLICY "On update, ensure usage meter belongs to same organization as product" ON "prices" CASCADE;--> statement-breakpoint
DROP POLICY "Ensure organization integrity with products parent table" ON "prices" CASCADE;--> statement-breakpoint
CREATE POLICY "On update, ensure usage meter belongs to same pricing model" ON "prices" AS PERMISSIVE FOR UPDATE TO "merchant" WITH CHECK ("usage_meter_id" IS NULL
  OR "usage_meter_id" IN (
    SELECT "id" FROM "usage_meters"
    WHERE "usage_meters"."pricing_model_id" = "prices"."pricing_model_id"
  ));--> statement-breakpoint
CREATE POLICY "Merchant access via product or usage meter FK" ON "prices" AS PERMISSIVE FOR ALL TO "merchant" USING ((
            ("type" = 'usage' AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
            OR ("type" != 'usage' AND "product_id" IN (SELECT "id" FROM "products"))
          )) WITH CHECK ((
            ("type" = 'usage' AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
            OR ("type" != 'usage' AND "product_id" IN (SELECT "id" FROM "products"))
          ));--> statement-breakpoint
ALTER POLICY "Enable read for customers (prices)" ON "prices" TO customer USING ("active" = true AND (
            "product_id" IN (SELECT "id" FROM "products")
            OR ("product_id" IS NULL AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
          ));