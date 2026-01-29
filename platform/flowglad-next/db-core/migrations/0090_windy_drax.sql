ALTER TABLE "Users" DROP CONSTRAINT "Users_externalId_unique";--> statement-breakpoint
ALTER TABLE "Users" DROP COLUMN IF EXISTS "externalId";

-- 1. Verify externalId is ready to be a primary key
DO $$ 
BEGIN
  -- Check for nulls
  IF EXISTS (SELECT 1 FROM "Countries" WHERE "externalId" IS NULL) THEN
    RAISE EXCEPTION 'Found null externalId values in Countries';
  END IF;
  
  -- Check for duplicates
  IF EXISTS (
    SELECT "externalId"
    FROM "Countries"
    GROUP BY "externalId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Found duplicate externalId values in Countries';
  END IF;
END $$;

-- 2. Add new column to Organizations to hold the new foreign key values
ALTER TABLE "Organizations" ADD COLUMN "CountryNewId" text;

-- 3. Populate the new column with the corresponding externalIds from Countries
UPDATE "Organizations" o
SET "CountryNewId" = (
  SELECT "externalId"
  FROM "Countries" c
  WHERE c.id = o."CountryId"
);

-- 4. Drop the old foreign key constraint
ALTER TABLE "Organizations" DROP CONSTRAINT "Organizations_CountryId_Countries_id_fk";

-- 5. Change Countries table
ALTER TABLE "Countries" DROP CONSTRAINT "Countries_pkey";
ALTER TABLE "Countries" ADD PRIMARY KEY ("externalId");
ALTER TABLE "Countries" DROP COLUMN "id";
ALTER TABLE "Countries" RENAME COLUMN "externalId" TO "id";

-- 6. Add NOT NULL constraint to new Organizations column
ALTER TABLE "Organizations" ALTER COLUMN "CountryNewId" SET NOT NULL;

-- 7. Add the new foreign key constraint
ALTER TABLE "Organizations" ADD CONSTRAINT "Organizations_CountryId_Countries_id_fkey"
  FOREIGN KEY ("CountryNewId") REFERENCES "Countries" ("id");

-- 8. Drop old column and rename new one
ALTER TABLE "Organizations" DROP COLUMN "CountryId";
ALTER TABLE "Organizations" RENAME COLUMN "CountryNewId" TO "CountryId";
