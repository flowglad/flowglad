-- First verify the data will map correctly for all tables
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Forms" 
    WHERE "externalId" IS NULL OR "externalId" = ''
  ) THEN
    RAISE EXCEPTION 'Data validation failed - found null or empty externalIds in Forms';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "FormFields" 
    WHERE "externalId" IS NULL OR "externalId" = ''
  ) THEN
    RAISE EXCEPTION 'Data validation failed - found null or empty externalIds in FormFields';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "FormSubmissions" 
    WHERE "externalId" IS NULL OR "externalId" = ''
  ) THEN
    RAISE EXCEPTION 'Data validation failed - found null or empty externalIds in FormSubmissions';
  END IF;
END $$;

-- Add new columns to child tables
ALTER TABLE "FormFields" ADD COLUMN "FormNewId" text;
ALTER TABLE "FormSubmissions" ADD COLUMN "FormNewId" text;

-- Populate new columns with the externalIds
UPDATE "FormFields" ff
SET "FormNewId" = (
  SELECT f."externalId"
  FROM "Forms" f
  WHERE f.id = ff."FormId"
);

UPDATE "FormSubmissions" fs
SET "FormNewId" = (
  SELECT f."externalId"
  FROM "Forms" f
  WHERE f.id = fs."FormId"
);

-- Verify all child records got their new IDs
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM "FormFields" 
    WHERE "FormNewId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Data validation failed - some FormFields did not get new IDs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "FormSubmissions" 
    WHERE "FormNewId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Data validation failed - some FormSubmissions did not get new IDs';
  END IF;
END $$;

-- Drop the existing foreign key constraints
ALTER TABLE "FormFields" DROP CONSTRAINT "FormFields_FormId_Forms_id_fk";
ALTER TABLE "FormSubmissions" DROP CONSTRAINT "FormSubmissions_FormId_Forms_id_fk";

-- Change all id columns to text using externalId values
ALTER TABLE "Forms" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "FormFields" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "FormSubmissions" ALTER COLUMN "id" TYPE text USING "externalId";

-- Add new foreign key constraints
ALTER TABLE "FormFields" ADD CONSTRAINT "FormFields_FormId_Forms_id_fkey"
  FOREIGN KEY ("FormNewId") REFERENCES "Forms" ("id");

ALTER TABLE "FormSubmissions" ADD CONSTRAINT "FormSubmissions_FormId_Forms_id_fkey"
  FOREIGN KEY ("FormNewId") REFERENCES "Forms" ("id");

-- Drop old columns and rename new ones
ALTER TABLE "FormFields" DROP COLUMN "FormId";
ALTER TABLE "FormFields" RENAME COLUMN "FormNewId" TO "FormId";

ALTER TABLE "FormSubmissions" DROP COLUMN "FormId";
ALTER TABLE "FormSubmissions" RENAME COLUMN "FormNewId" TO "FormId";

-- Finally drop the now-redundant externalIds
ALTER TABLE "Forms" DROP COLUMN "externalId";
ALTER TABLE "FormFields" DROP COLUMN "externalId";
ALTER TABLE "FormSubmissions" DROP COLUMN "externalId";
