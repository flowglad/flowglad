ALTER TABLE "Customers" DROP CONSTRAINT "Customers_externalId_unique";--> statement-breakpoint

-- First drop the RLS policy
DROP POLICY IF EXISTS "Enable read access via CustomerProfiles" ON "Customers";

-- First verify the data will map correctly
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Customers" 
    WHERE "externalId" IS NULL OR "externalId" = ''
  ) THEN
    RAISE EXCEPTION 'Data validation failed - found null or empty externalIds';
  END IF;
END $$;

-- Add new column to CustomerProfiles to hold the text IDs
ALTER TABLE "CustomerProfiles" ADD COLUMN "CustomerNewId" text;

-- Populate new column with the externalIds from Customers
UPDATE "CustomerProfiles" cp
SET "CustomerNewId" = (
  SELECT c."externalId"
  FROM "Customers" c
  WHERE c.id = cp."CustomerId"
);

-- Verify all CustomerProfiles got their new IDs
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CustomerProfiles" 
    WHERE "CustomerNewId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Data validation failed - some CustomerProfiles did not get new IDs';
  END IF;
END $$;

-- Drop the existing foreign key constraint
ALTER TABLE "CustomerProfiles" DROP CONSTRAINT "CustomerProfiles_CustomerId_Customers_id_fk";

-- Change Customers.id to text using externalId values
ALTER TABLE "Customers" ALTER COLUMN "id" TYPE text USING "externalId";

-- Add new foreign key constraint
ALTER TABLE "CustomerProfiles" ADD CONSTRAINT "CustomerProfiles_CustomerId_Customers_id_fkey"
  FOREIGN KEY ("CustomerNewId") REFERENCES "Customers" ("id");

-- Drop old CustomerId column and rename new one
ALTER TABLE "CustomerProfiles" DROP COLUMN "CustomerId";
ALTER TABLE "CustomerProfiles" RENAME COLUMN "CustomerNewId" TO "CustomerId";

-- Finally drop the now-redundant externalId from Customers
ALTER TABLE "Customers" DROP COLUMN "externalId";

-- Recreate the RLS policy with the same logic
CREATE POLICY "Enable read access via CustomerProfiles" ON "Customers"
    FOR SELECT
    USING (id IN (
        SELECT "CustomerId"
        FROM "CustomerProfiles"
    ));
