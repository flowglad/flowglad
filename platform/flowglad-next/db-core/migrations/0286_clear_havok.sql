-- Phase 1: DDL Setup - Add nullable column with FK constraint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "pricing_model_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Phase 1b: Create default pricing models for organizations that lack them
-- This handles organizations that have API keys but no pricing models at all
DO $$
DECLARE
  org_record RECORD;
  new_pm_id text;
  pm_name text;
  next_position bigint;
BEGIN
  -- Find all org+livemode combinations that have API keys but no pricing models
  FOR org_record IN
    SELECT DISTINCT ak."organization_id", ak."livemode"
    FROM "api_keys" ak
    WHERE NOT EXISTS (
      SELECT 1 FROM "pricing_models" pm
      WHERE pm."organization_id" = ak."organization_id"
        AND pm."livemode" = ak."livemode"
    )
  LOOP
    -- Generate ID in format: pricing_model_<nanoid> (matching core.nanoid format)
    -- Using URL-safe alphabet: 0-9A-Za-z (62 chars), length 21
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

    -- Get next position from sequence
    SELECT nextval('catalogs_position_seq') INTO next_position;

    -- Set name based on livemode
    IF org_record."livemode" THEN
      pm_name := 'Pricing Model';
    ELSE
      pm_name := '[TEST] Pricing Model';
    END IF;

    INSERT INTO "pricing_models" (
      "id",
      "organization_id",
      "livemode",
      "is_default",
      "name",
      "position",
      "created_at",
      "updated_at"
    ) VALUES (
      new_pm_id,
      org_record."organization_id",
      org_record."livemode",
      true,
      pm_name,
      next_position,
      NOW(),
      NOW()
    );

    RAISE NOTICE 'Created default pricing model id=% for org_id=%, livemode=%',
      new_pm_id, org_record."organization_id", org_record."livemode";
  END LOOP;
END $$;
--> statement-breakpoint
-- Phase 1c: Mark one pricing model as default for orgs that have pricing models but none marked as default
-- This handles organizations that have pricing models but is_default=false on all of them
DO $$
DECLARE
  org_record RECORD;
  pm_to_update_id text;
BEGIN
  -- Find all org+livemode combinations that have pricing models but none marked as default
  FOR org_record IN
    SELECT DISTINCT ak."organization_id", ak."livemode"
    FROM "api_keys" ak
    WHERE EXISTS (
      SELECT 1 FROM "pricing_models" pm
      WHERE pm."organization_id" = ak."organization_id"
        AND pm."livemode" = ak."livemode"
    )
    AND NOT EXISTS (
      SELECT 1 FROM "pricing_models" pm
      WHERE pm."organization_id" = ak."organization_id"
        AND pm."livemode" = ak."livemode"
        AND pm."is_default" = true
    )
  LOOP
    -- Pick the first pricing model (by created_at) for this org+livemode to be the default
    SELECT pm."id" INTO pm_to_update_id
    FROM "pricing_models" pm
    WHERE pm."organization_id" = org_record."organization_id"
      AND pm."livemode" = org_record."livemode"
    ORDER BY pm."created_at" ASC
    LIMIT 1;

    IF pm_to_update_id IS NOT NULL THEN
      UPDATE "pricing_models"
      SET "is_default" = true, "updated_at" = NOW()
      WHERE "id" = pm_to_update_id;

      RAISE NOTICE 'Marked pricing model id=% as default for org_id=%, livemode=%',
        pm_to_update_id, org_record."organization_id", org_record."livemode";
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- Phase 2: Backfill DML - Populate from default pricing model per org+livemode
UPDATE "api_keys" ak
SET "pricing_model_id" = pm."id"
FROM "pricing_models" pm
WHERE ak."pricing_model_id" IS NULL
  AND pm."organization_id" = ak."organization_id"
  AND pm."is_default" = true
  AND pm."livemode" = ak."livemode";
--> statement-breakpoint
-- Phase 2b: Validation - Ensure no nulls remain
DO $$
DECLARE
  null_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO null_count FROM api_keys WHERE pricing_model_id IS NULL;
  IF null_count > 0 THEN
    RAISE NOTICE 'API keys with NULL pricing_model_id:';
    FOR rec IN
      SELECT id, organization_id, livemode, name
      FROM api_keys WHERE pricing_model_id IS NULL LIMIT 50
    LOOP
      RAISE NOTICE '  api_key_id=%, org_id=%, livemode=%, name=%',
        rec.id, rec.organization_id, rec.livemode, rec.name;
    END LOOP;
    RAISE EXCEPTION 'Migration validation failed: % api_keys have NULL pricing_model_id', null_count;
  END IF;
END $$;
--> statement-breakpoint
-- Phase 3: Finalize DDL - Set NOT NULL and create index
ALTER TABLE "api_keys" ALTER COLUMN "pricing_model_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_pricing_model_id_idx" ON "api_keys" USING btree ("pricing_model_id");
