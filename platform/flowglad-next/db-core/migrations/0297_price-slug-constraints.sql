-- Add NOT NULL and CHECK constraints to prices.slug
-- Requires migration 0296 (backfill) to have run first

-- Validation block: Ensure no prices have invalid slugs
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM prices WHERE slug IS NULL OR slug = '';

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot add constraint: % prices have invalid slug', invalid_count;
  END IF;
END $$;
--> statement-breakpoint

-- Add NOT NULL constraint
ALTER TABLE "prices" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint

-- Add CHECK constraint to prevent empty strings
ALTER TABLE "prices" ADD CONSTRAINT "prices_slug_not_empty" CHECK (slug <> '');
