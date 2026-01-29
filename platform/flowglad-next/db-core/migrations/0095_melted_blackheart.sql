-- First drop all the RLS policies that reference Products
DROP POLICY "Enable read for own organizations" ON "Communities";
DROP POLICY "Enable read for own organizations" ON "Files";
DROP POLICY "Enable all for own organizations" ON "Forms";
DROP POLICY "Enable read for own organizations" ON "Links";
DROP POLICY "Enable all for self organizations via products" ON "Variants";

-- First verify Products.externalId is ready to be the new id
DO $$ 
BEGIN
 IF EXISTS (
   SELECT 1 FROM "Products" 
   WHERE "externalId" IS NULL OR "externalId" = ''
 ) THEN
   RAISE EXCEPTION 'Data validation failed - found null or empty externalIds in Products';
 END IF;
END $$;

-- Add new columns to all referencing tables
ALTER TABLE "Variants" ADD COLUMN "ProductNewId" text;
ALTER TABLE "Communities" ADD COLUMN "ProductNewId" text;
ALTER TABLE "Files" ADD COLUMN "ProductNewId" text;
ALTER TABLE "Forms" ADD COLUMN "ProductNewId" text;
ALTER TABLE "Links" ADD COLUMN "ProductNewId" text;

-- Populate new columns with the externalIds
UPDATE "Variants" v
SET "ProductNewId" = (
 SELECT p."externalId"
 FROM "Products" p
 WHERE p.id = v."ProductId"
);

UPDATE "Communities" c
SET "ProductNewId" = (
 SELECT p."externalId"
 FROM "Products" p
 WHERE p.id = c."ProductId"
);

UPDATE "Files" f
SET "ProductNewId" = (
 SELECT p."externalId"
 FROM "Products" p
 WHERE p.id = f."ProductId"
);

UPDATE "Forms" f
SET "ProductNewId" = (
 SELECT p."externalId"
 FROM "Products" p
 WHERE p.id = f."ProductId"
);

UPDATE "Links" l
SET "ProductNewId" = (
 SELECT p."externalId"
 FROM "Products" p
 WHERE p.id = l."ProductId"
);

-- Verify all required records got their new IDs (Variants only - others are nullable)
DO $$ 
BEGIN
 IF EXISTS (
   SELECT 1 FROM "Variants" 
   WHERE "ProductNewId" IS NULL
 ) THEN
   RAISE EXCEPTION 'Data validation failed - some Variants did not get new IDs';
 END IF;
END $$;

-- Drop the existing foreign key constraints
ALTER TABLE "Variants" DROP CONSTRAINT "Variants_ProductId_Products_id_fk";
ALTER TABLE "Communities" DROP CONSTRAINT "Communities_ProductId_Products_id_fk";
ALTER TABLE "Files" DROP CONSTRAINT "Files_ProductId_Products_id_fk";
ALTER TABLE "Forms" DROP CONSTRAINT "Forms_ProductId_Products_id_fk";
ALTER TABLE "Links" DROP CONSTRAINT "Links_ProductId_Products_id_fk";

-- Drop identity constraint on Products.id
ALTER TABLE "Products" ALTER COLUMN "id" DROP IDENTITY IF EXISTS;

-- Temporarily lift primary key constraint on Products.id
ALTER TABLE "Products" DROP CONSTRAINT IF EXISTS "Products_pkey";

-- Change Products.id to text using externalId values
ALTER TABLE "Products" ALTER COLUMN "id" TYPE text USING "externalId";

-- Add primary key and unique constraint to Products.id
ALTER TABLE "Products" ADD PRIMARY KEY ("id");
ALTER TABLE "Products" ADD CONSTRAINT "Products_id_unique" UNIQUE ("id");

-- Add new foreign key constraints
ALTER TABLE "Variants" ADD CONSTRAINT "Variants_ProductId_Products_id_fkey"
 FOREIGN KEY ("ProductNewId") REFERENCES "Products" ("id");

ALTER TABLE "Communities" ADD CONSTRAINT "Communities_ProductId_Products_id_fkey"
 FOREIGN KEY ("ProductNewId") REFERENCES "Products" ("id");

ALTER TABLE "Files" ADD CONSTRAINT "Files_ProductId_Products_id_fkey"
 FOREIGN KEY ("ProductNewId") REFERENCES "Products" ("id");

ALTER TABLE "Forms" ADD CONSTRAINT "Forms_ProductId_Products_id_fkey"
 FOREIGN KEY ("ProductNewId") REFERENCES "Products" ("id");

ALTER TABLE "Links" ADD CONSTRAINT "Links_ProductId_Products_id_fkey"
 FOREIGN KEY ("ProductNewId") REFERENCES "Products" ("id");

-- Drop old columns and rename new ones
ALTER TABLE "Variants" DROP COLUMN "ProductId";
ALTER TABLE "Variants" RENAME COLUMN "ProductNewId" TO "ProductId";

ALTER TABLE "Communities" DROP COLUMN "ProductId";
ALTER TABLE "Communities" RENAME COLUMN "ProductNewId" TO "ProductId";

ALTER TABLE "Files" DROP COLUMN "ProductId";
ALTER TABLE "Files" RENAME COLUMN "ProductNewId" TO "ProductId";

ALTER TABLE "Forms" DROP COLUMN "ProductId";
ALTER TABLE "Forms" RENAME COLUMN "ProductNewId" TO "ProductId";

ALTER TABLE "Links" DROP COLUMN "ProductId";
ALTER TABLE "Links" RENAME COLUMN "ProductNewId" TO "ProductId";

-- Finally drop the now-redundant externalId from Products
ALTER TABLE "Products" DROP COLUMN "externalId";

-- Drop unique constraint on Products.externalId if it exists
DO $$ 
BEGIN
 BEGIN
   ALTER TABLE "Products" DROP CONSTRAINT "Products_externalId_unique";
 EXCEPTION 
   WHEN undefined_object THEN NULL;
 END;
END $$;

-- Recreate all the RLS policies
CREATE POLICY "Enable read for own organizations" ON "Communities"
 FOR ALL
 USING ("OrganizationId" IN (
   SELECT "OrganizationId"
   FROM "Memberships"
 ))
 WITH CHECK (
   "OrganizationId" IN (SELECT "OrganizationId" FROM "Memberships")
   AND ("ProductId" IS NULL OR "ProductId" IN (SELECT id FROM "Products"))
   AND ("IntegrationId" IS NULL OR EXISTS (
     SELECT 1
     FROM "Integrations" i
     WHERE i.id = "Communities"."IntegrationId"
     AND CASE
       WHEN "Communities".platform = 'discord'::"CommunityPlatform" THEN i.provider = 'discord'
       WHEN "Communities".platform = 'slack'::"CommunityPlatform" THEN i.provider = 'slack'
       ELSE NULL::boolean
     END
   ))
 );

CREATE POLICY "Enable read for own organizations" ON "Files"
 FOR ALL
 USING ("OrganizationId" IN (
   SELECT "OrganizationId"
   FROM "Memberships"
 ))
 WITH CHECK ("ProductId" IS NULL OR "ProductId" IN (
   SELECT id
   FROM "Products"
 ));

CREATE POLICY "Enable all for own organizations" ON "Forms"
 FOR ALL
 USING ("OrganizationId" IN (
   SELECT "OrganizationId"
   FROM "Memberships"
 ))
 WITH CHECK ("ProductId" IS NULL OR "ProductId" IN (
   SELECT id
   FROM "Products"
 ));

CREATE POLICY "Enable read for own organizations" ON "Links"
 FOR ALL
 USING ("OrganizationId" IN (
   SELECT "OrganizationId"
   FROM "Memberships"
 ))
 WITH CHECK ("ProductId" IS NULL OR "ProductId" IN (
   SELECT id
   FROM "Products"
 ));

CREATE POLICY "Allow self organization records" ON "Variants"
 FOR ALL
 USING ("ProductId" IN (
   SELECT id
   FROM "Products"
 ));
