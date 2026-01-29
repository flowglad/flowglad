
-- First, create default catalogs for each organization
WITH organizations AS (
  SELECT DISTINCT organization_id FROM products
)
INSERT INTO catalogs (id, organization_id, name, is_default, livemode, "createdAt", "updatedAt")
SELECT 
  'catalog_' || gen_random_uuid()::text, -- for live mode catalogs
  organization_id,
  'Default',
  true,
  true,
  NOW(),
  NOW()
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM catalogs c 
  WHERE c.organization_id = organizations.organization_id 
  AND c.is_default = true 
  AND c.livemode = true
)
UNION ALL
SELECT 
  'catalog_' || gen_random_uuid()::text, -- for live mode catalogs
  organization_id,
  'Default (testmode)',
  true,
  false,
  NOW(),
  NOW()
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM catalogs c 
  WHERE c.organization_id = organizations.organization_id 
  AND c.is_default = true 
  AND c.livemode = false
);

-- Rest of the migration remains the same
UPDATE products p
SET catalog_id = c.id
FROM catalogs c
WHERE p.organization_id = c.organization_id
AND p.livemode = c.livemode
AND c.is_default = true
AND p.catalog_id IS NULL;

-- Verify no products have null catalog_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE catalog_id IS NULL) THEN
    RAISE EXCEPTION 'Some products still have null catalog_id';
  END IF;
END
$$;

ALTER TABLE "products" ALTER COLUMN "catalog_id" SET NOT NULL;