-- Patch 3: Add NOT NULL and CHECK constraints to products.slug
-- Requires Patch 1 (backfill) to have run first

-- Validation block: Ensure no products have invalid slugs
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM products WHERE slug IS NULL OR slug = '';

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot add constraint: % products have invalid slug', invalid_count;
  END IF;
END $$;
--> statement-breakpoint

-- Add NOT NULL constraint
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint

-- Add CHECK constraint to prevent empty strings
ALTER TABLE "products" ADD CONSTRAINT "products_slug_not_empty" CHECK (slug <> '');
