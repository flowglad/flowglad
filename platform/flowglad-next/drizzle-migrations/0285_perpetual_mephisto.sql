-- Phase 1: DDL Setup - Add nullable column with FK constraint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "pricing_model_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
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
