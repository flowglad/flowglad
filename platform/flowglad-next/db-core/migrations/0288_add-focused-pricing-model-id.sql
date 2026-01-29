-- Memberships Focused Pricing Model Migration
-- This migration adds focusedPricingModelId to the memberships table
--
-- STRUCTURE: This migration uses a 3-phase approach for safety:
-- Phase 1: DDL setup (separate statements)
-- Phase 1c: Ensure default PMs exist for each membership's org+livemode
-- Phase 2: All DML in a single transaction (backfill)
-- Phase 2b: Validation checks
-- Phase 3: Final DDL (separate statements)

-- ============================================================================
-- PHASE 1: DDL SETUP (separate statements, can partially fail and be re-run)
-- ============================================================================

-- Step 1: Add focused_pricing_model_id column (nullable for now)
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "focused_pricing_model_id" text;--> statement-breakpoint

-- Step 2: Add foreign key for focused_pricing_model_id
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_focused_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("focused_pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- ============================================================================
-- PHASE 1c: Ensure default PMs exist for each membership's org+livemode
-- ============================================================================

-- Create default pricing models for org+livemode combinations that have memberships but no default PM
-- This handles edge cases where an org has memberships but no pricing model for that livemode
DO $$
DECLARE
  org_record RECORD;
  new_pm_id text;
  pm_name text;
  next_position bigint;
BEGIN
  -- Find all org+livemode combinations that have memberships but no default pricing model
  FOR org_record IN
    SELECT DISTINCT m."organization_id", m."livemode"
    FROM "memberships" m
    WHERE NOT EXISTS (
      SELECT 1 FROM "pricing_models" pm
      WHERE pm."organization_id" = m."organization_id"
        AND pm."livemode" = m."livemode"
        AND pm."is_default" = true
    )
  LOOP
    -- Check if any PM exists for this org+livemode (just not marked as default)
    IF EXISTS (
      SELECT 1 FROM "pricing_models" pm
      WHERE pm."organization_id" = org_record."organization_id"
        AND pm."livemode" = org_record."livemode"
    ) THEN
      -- Mark the first one as default
      UPDATE "pricing_models"
      SET "is_default" = true, "updated_at" = NOW()
      WHERE "id" = (
        SELECT "id" FROM "pricing_models"
        WHERE "organization_id" = org_record."organization_id"
          AND "livemode" = org_record."livemode"
        ORDER BY "created_at" ASC
        LIMIT 1
      );
      RAISE NOTICE 'Marked existing PM as default for org_id=%, livemode=%',
        org_record."organization_id", org_record."livemode";
    ELSE
      -- Create a new default PM
      new_pm_id := 'pricing_model_' || array_to_string(
        ARRAY(
          SELECT substr(
            '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
            floor(random() * 62 + 1)::int,
            1
          )
          FROM generate_series(1, 21)
        ),
        ''
      );
      SELECT nextval('catalogs_position_seq') INTO next_position;
      IF org_record."livemode" THEN
        pm_name := 'Pricing Model';
      ELSE
        pm_name := '[TEST] Pricing Model';
      END IF;
      INSERT INTO "pricing_models" (
        "id", "organization_id", "livemode", "is_default", "name", "position", "created_at", "updated_at"
      ) VALUES (
        new_pm_id, org_record."organization_id", org_record."livemode", true, pm_name, next_position, NOW(), NOW()
      );
      RAISE NOTICE 'Created default PM id=% for org_id=%, livemode=%',
        new_pm_id, org_record."organization_id", org_record."livemode";
    END IF;
  END LOOP;
END $$;--> statement-breakpoint

-- ============================================================================
-- PHASE 2: ALL DML IN A SINGLE TRANSACTION
-- This entire block runs atomically - if any step fails, everything rolls back
-- ============================================================================

-- Step 3: Backfill focused_pricing_model_id matching membership's EXISTING livemode
-- This preserves user's current context (if they were in test mode, they stay in test mode)
UPDATE "memberships" m
SET "focused_pricing_model_id" = pm."id"
FROM "pricing_models" pm
WHERE m."focused_pricing_model_id" IS NULL
  AND pm."organization_id" = m."organization_id"
  AND pm."is_default" = true
  AND pm."livemode" = m."livemode";--> statement-breakpoint

-- ============================================================================
-- VALIDATION CHECKS (before committing the transaction)
-- These will ROLLBACK the entire transaction if any check fails
-- ============================================================================

-- Validate: All memberships have focused_pricing_model_id set
DO $$
DECLARE
  null_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM memberships
  WHERE focused_pricing_model_id IS NULL;

  IF null_count > 0 THEN
    RAISE NOTICE 'Memberships with NULL focused_pricing_model_id:';
    FOR rec IN
      SELECT id, organization_id, user_id, livemode, focused
      FROM memberships
      WHERE focused_pricing_model_id IS NULL
      LIMIT 50
    LOOP
      RAISE NOTICE '  membership_id=%, org_id=%, user_id=%, livemode=%, focused=%',
        rec.id, rec.organization_id, rec.user_id, rec.livemode, rec.focused;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % memberships have NULL focused_pricing_model_id', null_count;
  END IF;
END $$;--> statement-breakpoint

-- ============================================================================
-- PHASE 3: FINAL DDL (separate statements)
-- ============================================================================

-- Step 4: Set focused_pricing_model_id to NOT NULL
ALTER TABLE "memberships" ALTER COLUMN "focused_pricing_model_id" SET NOT NULL;--> statement-breakpoint

-- Step 5: Create index on focused_pricing_model_id
CREATE INDEX IF NOT EXISTS "memberships_focused_pricing_model_id_idx"
  ON "memberships" USING btree ("focused_pricing_model_id");
