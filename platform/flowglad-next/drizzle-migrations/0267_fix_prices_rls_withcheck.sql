-- Fix RLS policies for prices table
-- This migration ensures:
-- 1. FK integrity policies have explicit WITH CHECK clauses for INSERT operations
-- 2. Customer read policy correctly specifies TO customer

-- Step 1: Drop existing policies
DROP POLICY IF EXISTS "Enable read for customers (prices)" ON "prices";--> statement-breakpoint
DROP POLICY IF EXISTS "Ensure product FK integrity for non-usage prices" ON "prices";--> statement-breakpoint
DROP POLICY IF EXISTS "Ensure usage meter FK integrity for usage prices" ON "prices";--> statement-breakpoint

-- Step 2: Recreate customer read policy with TO customer
-- This policy allows customers to read active prices that either:
-- - Have a product_id that exists in products (non-usage prices)
-- - Have null product_id but have a usage_meter_id that exists (usage prices)
CREATE POLICY "Enable read for customers (prices)" ON "prices"
AS PERMISSIVE
FOR SELECT
TO customer
USING (
  "active" = true AND (
    "product_id" IN (SELECT "id" FROM "products")
    OR ("product_id" IS NULL AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
  )
);--> statement-breakpoint

-- Step 3: Recreate FK integrity policies with explicit WITH CHECK clauses
-- Product FK integrity for non-usage prices
-- For usage prices (type='usage'), this policy passes via the type check.
-- For non-usage prices, productId must exist in products table.
CREATE POLICY "Ensure product FK integrity for non-usage prices" ON "prices"
AS PERMISSIVE
FOR ALL
TO merchant
USING ("type" = 'usage' OR "product_id" IN (SELECT "id" FROM "products"))
WITH CHECK ("type" = 'usage' OR "product_id" IN (SELECT "id" FROM "products"));--> statement-breakpoint

-- Usage meter FK integrity for usage prices
-- For non-usage prices (type!='usage'), this policy passes via the type check.
-- For usage prices, usageMeterId must exist in usage_meters table.
CREATE POLICY "Ensure usage meter FK integrity for usage prices" ON "prices"
AS PERMISSIVE
FOR ALL
TO merchant
USING ("type" != 'usage' OR "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
WITH CHECK ("type" != 'usage' OR "usage_meter_id" IN (SELECT "id" FROM "usage_meters"));
