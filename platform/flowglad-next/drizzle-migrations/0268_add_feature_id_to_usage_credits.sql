DROP INDEX IF EXISTS "usage_credits_payment_id_subscription_id_usage_meter_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_credits_dedup_uidx";--> statement-breakpoint
ALTER TABLE "usage_credits" ADD COLUMN "feature_id" text;--> statement-breakpoint

-- Backfill feature_id from subscription_item_features
UPDATE "usage_credits" uc
SET "feature_id" = sif."feature_id"
FROM "subscription_item_features" sif
WHERE uc."source_reference_id" = sif."id"
  AND uc."source_reference_type" = 'ManualAdjustment';--> statement-breakpoint

-- Cleanup duplicates after backfilling feature_id (to handle race conditions where different source_reference_ids mapped to same feature)
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY subscription_id, billing_period_id, feature_id, usage_meter_id
      ORDER BY created_at ASC
    ) as rn
  FROM "usage_credits"
  WHERE "source_reference_type" = 'ManualAdjustment' AND "feature_id" IS NOT NULL
)
DELETE FROM "usage_credits"
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_credits_unique_feature_dedup_idx" ON "usage_credits" USING btree ("subscription_id","billing_period_id","feature_id","usage_meter_id") NULLS NOT DISTINCT WHERE "source_reference_type" = 'ManualAdjustment' AND "feature_id" IS NOT NULL;