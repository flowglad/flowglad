-- Backfill products with null or empty slugs
-- Pattern: snake_case(name) with unique suffix for duplicates

-- First pass: Update products where the base slug won't cause a collision
UPDATE products p
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      TRIM(name),
      '[^a-zA-Z0-9]+', '_', 'g'
    ),
    '^_|_$', '', 'g'
  )
)
WHERE (slug IS NULL OR slug = '')
  AND NOT EXISTS (
    -- Check for existing products with same pricing_model_id and computed slug
    SELECT 1 FROM products p2
    WHERE p2.pricing_model_id = p.pricing_model_id
      AND p2.id != p.id
      AND (
        p2.slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(p.name), '[^a-zA-Z0-9]+', '_', 'g'), '^_|_$', '', 'g'))
        OR (
          (p2.slug IS NULL OR p2.slug = '')
          AND LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(p2.name), '[^a-zA-Z0-9]+', '_', 'g'), '^_|_$', '', 'g'))
            = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(p.name), '[^a-zA-Z0-9]+', '_', 'g'), '^_|_$', '', 'g'))
        )
      )
  );

-- Second pass: Update remaining products with unique suffix (last 8 chars of id)
UPDATE products
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      TRIM(name),
      '[^a-zA-Z0-9]+', '_', 'g'
    ),
    '^_|_$', '', 'g'
  )
) || '_' || RIGHT(id, 8)
WHERE slug IS NULL OR slug = '';

-- Verification
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM products WHERE slug IS NULL OR slug = '';

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % products still have invalid slugs', invalid_count;
  END IF;
END $$;
