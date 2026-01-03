-- Cleanup duplicates before creating uniqueness constraint
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY source_reference_id, source_reference_type, billing_period_id
      ORDER BY created_at ASC
    ) as rn
  FROM "usage_credits"
)
DELETE FROM "usage_credits"
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "usage_credits_dedup_uidx" ON "usage_credits" USING btree ("source_reference_id","source_reference_type","billing_period_id") NULLS NOT DISTINCT;--> statement-breakpoint
