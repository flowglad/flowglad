-- Events & Webhooks Pricing Model Migration
-- This migration adds pricingModelId to events and webhooks tables
--
-- STRUCTURE: This migration uses a 3-phase approach for safety:
-- Phase 1: DDL setup (separate statements)
-- Phase 2: All DML in a single transaction (BEGIN/COMMIT block)
-- Phase 3: Final DDL (separate statements)

-- ============================================================================
-- PHASE 1: DDL SETUP (separate statements, can partially fail and be re-run)
-- ============================================================================

-- Step 1: Add events.pricing_model_id column (nullable for now)
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "pricing_model_id" text;--> statement-breakpoint

-- Step 2: Add foreign key for events.pricing_model_id
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Step 3: Add webhooks.pricing_model_id column (nullable for now)
ALTER TABLE "webhooks" ADD COLUMN IF NOT EXISTS "pricing_model_id" text;--> statement-breakpoint

-- Step 4: Add foreign key for webhooks.pricing_model_id
DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- ============================================================================
-- PHASE 2: ALL DML IN A SINGLE TRANSACTION
-- This entire block runs atomically - if any step fails, everything rolls back
-- ============================================================================

-- Step 5: Backfill events.pricing_model_id from payload object tables
--
-- Events have a payload JSONB with {id, object} where object is an EventNoun
-- (customer, subscription, payment, purchase, etc.)
-- We derive pricing_model_id by looking up the entity in its respective table.

-- Backfill from customers (object = 'customer')
UPDATE "events" e
SET "pricing_model_id" = c."pricing_model_id"
FROM "customers" c
WHERE e."pricing_model_id" IS NULL
  AND e."payload"->>'object' = 'customer'
  AND e."payload"->>'id' = c."id";

-- Backfill from subscriptions (object = 'subscription')
UPDATE "events" e
SET "pricing_model_id" = s."pricing_model_id"
FROM "subscriptions" s
WHERE e."pricing_model_id" IS NULL
  AND e."payload"->>'object' = 'subscription'
  AND e."payload"->>'id' = s."id";

-- Backfill from payments (object = 'payment')
UPDATE "events" e
SET "pricing_model_id" = p."pricing_model_id"
FROM "payments" p
WHERE e."pricing_model_id" IS NULL
  AND e."payload"->>'object' = 'payment'
  AND e."payload"->>'id' = p."id";

-- Backfill from purchases (object = 'purchase')
UPDATE "events" e
SET "pricing_model_id" = pur."pricing_model_id"
FROM "purchases" pur
WHERE e."pricing_model_id" IS NULL
  AND e."payload"->>'object' = 'purchase'
  AND e."payload"->>'id' = pur."id";

-- Backfill from invoices (object = 'invoice')
UPDATE "events" e
SET "pricing_model_id" = inv."pricing_model_id"
FROM "invoices" inv
WHERE e."pricing_model_id" IS NULL
  AND e."payload"->>'object' = 'invoice'
  AND e."payload"->>'id' = inv."id";

-- For remaining events without pricing_model_id (e.g., object = 'product', 'user'),
-- derive from organization's default pricing model
UPDATE "events" e
SET "pricing_model_id" = pm."id"
FROM "pricing_models" pm
WHERE e."pricing_model_id" IS NULL
  AND pm."organization_id" = e."organization_id"
  AND pm."is_default" = true
  AND pm."livemode" = e."livemode";

-- Step 6: Backfill webhooks.pricing_model_id from organization's default pricing model
UPDATE "webhooks" w
SET "pricing_model_id" = pm."id"
FROM "pricing_models" pm
WHERE w."pricing_model_id" IS NULL
  AND pm."organization_id" = w."organization_id"
  AND pm."is_default" = true
  AND pm."livemode" = w."livemode";

-- ============================================================================
-- VALIDATION CHECKS (before committing the transaction)
-- These will ROLLBACK the entire transaction if any check fails
-- ============================================================================

-- Validate: All events have pricing_model_id set
DO $$
DECLARE
  null_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM events
  WHERE pricing_model_id IS NULL;

  IF null_count > 0 THEN
    RAISE NOTICE 'Events with NULL pricing_model_id:';
    FOR rec IN
      SELECT id, organization_id, payload->>'object' as object_type, payload->>'id' as object_id
      FROM events
      WHERE pricing_model_id IS NULL
      LIMIT 50
    LOOP
      RAISE NOTICE '  event_id=%, org_id=%, object_type=%, object_id=%', rec.id, rec.organization_id, rec.object_type, rec.object_id;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % events have NULL pricing_model_id', null_count;
  END IF;
END $$;

-- Validate: All webhooks have pricing_model_id set
DO $$
DECLARE
  null_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM webhooks
  WHERE pricing_model_id IS NULL;

  IF null_count > 0 THEN
    RAISE NOTICE 'Webhooks with NULL pricing_model_id:';
    FOR rec IN
      SELECT id, organization_id, name, url
      FROM webhooks
      WHERE pricing_model_id IS NULL
      LIMIT 50
    LOOP
      RAISE NOTICE '  webhook_id=%, org_id=%, name=%, url=%', rec.id, rec.organization_id, rec.name, rec.url;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % webhooks have NULL pricing_model_id', null_count;
  END IF;
END $$;--> statement-breakpoint

-- ============================================================================
-- PHASE 3: FINAL DDL (separate statements)
-- ============================================================================

-- Step 7: Set events.pricing_model_id to NOT NULL
ALTER TABLE "events" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 8: Create index on events.pricing_model_id
CREATE INDEX IF NOT EXISTS "events_pricing_model_id_idx" ON "events" USING btree ("pricing_model_id");--> statement-breakpoint

-- Step 9: Set webhooks.pricing_model_id to NOT NULL
ALTER TABLE "webhooks" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 10: Create index on webhooks.pricing_model_id
CREATE INDEX IF NOT EXISTS "webhooks_pricing_model_id_idx" ON "webhooks" USING btree ("pricing_model_id");
