-- PR1: Make prices.product_id nullable for usage prices
-- Usage prices belong to usage meters, not products, so productId should be null

-- Step 1: Make product_id column nullable
ALTER TABLE "prices" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint

-- Step 2: Drop old unique indexes that assumed product_id is always present
DROP INDEX IF EXISTS "prices_external_id_product_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "prices_product_id_is_default_unique_idx";--> statement-breakpoint

-- Step 3: Create new conditional unique indexes
-- externalId unique per product for non-usage prices
CREATE UNIQUE INDEX "prices_external_id_product_id_unique_idx"
ON "prices" ("external_id", "product_id")
WHERE "type" != 'usage';--> statement-breakpoint

-- externalId unique per usage meter for usage prices
CREATE UNIQUE INDEX "prices_external_id_usage_meter_id_unique_idx"
ON "prices" ("external_id", "usage_meter_id")
WHERE "type" = 'usage';--> statement-breakpoint

-- isDefault unique per product for non-usage prices
CREATE UNIQUE INDEX "prices_product_id_is_default_unique_idx"
ON "prices" ("product_id")
WHERE "is_default" = true AND "type" != 'usage';--> statement-breakpoint

-- isDefault unique per usage meter for usage prices
CREATE UNIQUE INDEX "prices_usage_meter_is_default_unique_idx"
ON "prices" ("usage_meter_id")
WHERE "is_default" = true AND "type" = 'usage';--> statement-breakpoint

-- Step 4: Drop old RLS policies
DROP POLICY IF EXISTS "Enable read for customers (prices)" ON "prices";--> statement-breakpoint
DROP POLICY IF EXISTS "On update, ensure usage meter belongs to same organization as product" ON "prices";--> statement-breakpoint
DROP POLICY IF EXISTS "Ensure organization integrity with products parent table" ON "prices";--> statement-breakpoint

-- Step 5: Create new RLS policies that handle null productId for usage prices

-- Customer read access: handle both product prices and usage prices
CREATE POLICY "Enable read for customers (prices)" ON "prices"
FOR SELECT
USING (
  "active" = true AND (
    "product_id" IN (SELECT "id" FROM "products")
    OR ("product_id" IS NULL AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
  )
);--> statement-breakpoint

-- Merchant policy: ensure usage meter belongs to same pricing model
CREATE POLICY "On update, ensure usage meter belongs to same pricing model" ON "prices"
FOR UPDATE
TO merchant
WITH CHECK (
  "usage_meter_id" IS NULL
  OR "usage_meter_id" IN (
    SELECT "id" FROM "usage_meters"
    WHERE "usage_meters"."pricing_model_id" = "prices"."pricing_model_id"
  )
);--> statement-breakpoint

-- Product FK integrity for non-usage prices
CREATE POLICY "Ensure product FK integrity for non-usage prices" ON "prices"
FOR ALL
TO merchant
USING (
  "type" = 'usage' OR "product_id" IN (SELECT "id" FROM "products")
);--> statement-breakpoint

-- Usage meter FK integrity for usage prices
CREATE POLICY "Ensure usage meter FK integrity for usage prices" ON "prices"
FOR ALL
TO merchant
USING (
  "type" != 'usage' OR "usage_meter_id" IN (SELECT "id" FROM "usage_meters")
);
