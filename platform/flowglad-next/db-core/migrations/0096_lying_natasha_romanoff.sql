-- Drop policies that reference the ids we're changing
DROP POLICY "Enable read for own communities" ON "CommunityMemberships";
DROP POLICY "Enable read for own organizations" ON "CommunityMembershipClaims";

-- First verify externalIds are ready for all tables
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Communities" 
    WHERE "externalId" IS NULL OR "externalId" = ''
  ) THEN
    RAISE EXCEPTION 'Data validation failed - found null or empty externalIds in Communities';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "CommunityMemberships" 
    WHERE "externalId" IS NULL OR "externalId" = ''
  ) THEN
    RAISE EXCEPTION 'Data validation failed - found null or empty externalIds in CommunityMemberships';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "CommunityMembershipClaims" 
    WHERE "externalId" IS NULL OR "externalId" = ''
  ) THEN
    RAISE EXCEPTION 'Data validation failed - found null or empty externalIds in CommunityMembershipClaims';
  END IF;
END $$;

-- Add new columns to hold the new foreign key values
ALTER TABLE "CommunityMemberships" ADD COLUMN "CommunityNewId" text;
ALTER TABLE "CommunityMembershipClaims" ADD COLUMN "CommunityMembershipNewId" text;

-- Populate new foreign key columns with externalIds
UPDATE "CommunityMemberships" cm
SET "CommunityNewId" = (
  SELECT c."externalId"
  FROM "Communities" c
  WHERE c.id = cm."CommunityId"
);

UPDATE "CommunityMembershipClaims" cmc
SET "CommunityMembershipNewId" = (
  SELECT cm."externalId"
  FROM "CommunityMemberships" cm
  WHERE cm.id = cmc."CommunityMembershipId"
);

-- Verify foreign keys got populated
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CommunityMemberships" 
    WHERE "CommunityNewId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Data validation failed - some CommunityMemberships did not get new Community IDs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "CommunityMembershipClaims" 
    WHERE "CommunityMembershipNewId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Data validation failed - some CommunityMembershipClaims did not get new CommunityMembership IDs';
  END IF;
END $$;

-- Drop existing foreign key constraints
ALTER TABLE "CommunityMemberships" DROP CONSTRAINT "CommunityMemberships_CommunityId_Communities_id_fk";
ALTER TABLE "CommunityMembershipClaims" DROP CONSTRAINT "CommunityMembershipClaims_CommunityMembershipId_CommunityMember";

-- Change id columns to text using externalId values

-- Drop identity constraint on Communities.id
ALTER TABLE "Communities" ALTER COLUMN "id" DROP IDENTITY IF EXISTS;

-- Temporarily lift primary key constraint on Communities.id
ALTER TABLE "Communities" DROP CONSTRAINT IF EXISTS "Communities_pkey";

-- Change Communities.id to text using externalId values
ALTER TABLE "Communities" ALTER COLUMN "id" TYPE text USING "externalId";

-- Add primary key and unique constraint to Communities.id
ALTER TABLE "Communities" ADD PRIMARY KEY ("id");
ALTER TABLE "Communities" ADD CONSTRAINT "Communities_id_unique" UNIQUE ("id");
ALTER TABLE "CommunityMemberships" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "CommunityMembershipClaims" ALTER COLUMN "id" TYPE text USING "externalId";

-- Add new foreign key constraints
ALTER TABLE "CommunityMemberships" ADD CONSTRAINT "CommunityMemberships_CommunityId_Communities_id_fkey"
  FOREIGN KEY ("CommunityNewId") REFERENCES "Communities" ("id");

ALTER TABLE "CommunityMembershipClaims" ADD CONSTRAINT "CommunityMembershipClaims_CommunityMembershipId_CommunityMemberships_id_fkey"
  FOREIGN KEY ("CommunityMembershipNewId") REFERENCES "CommunityMemberships" ("id");

-- Drop old columns and rename new ones
ALTER TABLE "CommunityMemberships" DROP COLUMN "CommunityId";
ALTER TABLE "CommunityMemberships" RENAME COLUMN "CommunityNewId" TO "CommunityId";

ALTER TABLE "CommunityMembershipClaims" DROP COLUMN "CommunityMembershipId";
ALTER TABLE "CommunityMembershipClaims" RENAME COLUMN "CommunityMembershipNewId" TO "CommunityMembershipId";

-- For all the other tables without foreign key dependencies, simply convert their IDs
ALTER TABLE "DiscountRedemptions" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "Events" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "Files" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "Messages" ALTER COLUMN "id" TYPE text USING "externalId";

-- Drop identity constraint on PurchaseSessions.id
ALTER TABLE "PurchaseSessions" ALTER COLUMN "id" DROP IDENTITY IF EXISTS;

-- Temporarily lift primary key constraint on PurchaseSessions.id
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_pkey";

-- Change PurchaseSessions.id to text using externalId values
ALTER TABLE "PurchaseSessions" ALTER COLUMN "id" TYPE text USING "externalId";

-- Add primary key and unique constraint to PurchaseSessions.id
ALTER TABLE "PurchaseSessions" ADD PRIMARY KEY ("id");
ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_id_unique" UNIQUE ("id");

-- Drop all externalId columns
ALTER TABLE "Communities" DROP COLUMN "externalId";
ALTER TABLE "CommunityMemberships" DROP COLUMN "externalId";
ALTER TABLE "CommunityMembershipClaims" DROP COLUMN "externalId";
ALTER TABLE "DiscountRedemptions" DROP COLUMN "externalId";
ALTER TABLE "Events" DROP COLUMN "externalId";
ALTER TABLE "Files" DROP COLUMN "externalId";
ALTER TABLE "Messages" DROP COLUMN "externalId";
ALTER TABLE "PurchaseSessions" DROP COLUMN "externalId";

-- Recreate the RLS policies that reference the changed ids
CREATE POLICY "Enable read for own communities" ON "CommunityMemberships"
  FOR ALL
  USING (
    "CommunityId" IN (SELECT id FROM "Communities")
    OR "UserId" = requesting_user_id()
    OR "CustomerProfileId" IN (SELECT id FROM "CustomerProfiles")
  );

CREATE POLICY "Enable read for own organizations" ON "CommunityMembershipClaims"
  FOR ALL
  USING ("CommunityMembershipId" IN (
    SELECT id
    FROM "CommunityMemberships"
  ));
