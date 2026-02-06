-- Backfill prices with null or empty slugs
-- Pattern: {parent_slug}_price_{first 8 chars of id}
-- For non-usage prices: uses product slug
-- For usage prices: uses usage meter slug

-- Backfill non-usage prices (subscription, single_payment)
UPDATE prices p
SET slug = (
  SELECT prod.slug || '_price_' || SUBSTRING(p.id FROM 1 FOR 8)
  FROM products prod
  WHERE prod.id = p.product_id
)
WHERE p.type <> 'usage'
  AND (p.slug IS NULL OR p.slug = '')
  AND p.product_id IS NOT NULL;
--> statement-breakpoint

-- Backfill usage prices
UPDATE prices p
SET slug = (
  SELECT um.slug || '_price_' || SUBSTRING(p.id FROM 1 FOR 8)
  FROM usage_meters um
  WHERE um.id = p.usage_meter_id
)
WHERE p.type = 'usage'
  AND (p.slug IS NULL OR p.slug = '')
  AND p.usage_meter_id IS NOT NULL;
--> statement-breakpoint

-- Verification
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM prices WHERE slug IS NULL OR slug = '';

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % prices still have invalid slugs', invalid_count;
  END IF;
END $$;
