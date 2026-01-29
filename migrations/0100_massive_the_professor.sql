-- Drop policies
DROP POLICY IF EXISTS "Enable read for own communities" ON "CommunityMemberships";
DROP POLICY IF EXISTS "Enable self access via CustomerProfiles" ON "Invoices";
DROP POLICY IF EXISTS "Enable self access via CustomerProfiles" ON "Testimonials";

-- Drop foreign key constraints
ALTER TABLE "CommunityMemberships" DROP CONSTRAINT IF EXISTS "CommunityMemberships_CustomerProfileId_CustomerProfiles_id_fk";
ALTER TABLE "Invoices" DROP CONSTRAINT IF EXISTS "Invoices_CustomerProfileId_CustomerProfiles_id_fk";
ALTER TABLE "Messages" DROP CONSTRAINT IF EXISTS "Messages_CustomerProfileId_CustomerProfiles_id_fk";
ALTER TABLE "Purchases" DROP CONSTRAINT IF EXISTS "Purchases_CustomerProfileId_CustomerProfiles_id_fk";
ALTER TABLE "Testimonials" DROP CONSTRAINT IF EXISTS "Testimonials_CustomerProfileId_CustomerProfiles_id_fk";

-- Update foreign keys
DO $$
BEGIN
  -- CommunityMemberships
  ALTER TABLE "CommunityMemberships" ADD COLUMN new_customer_profile_id text;
  UPDATE "CommunityMemberships" cm 
  SET new_customer_profile_id = cp."externalId" 
  FROM "CustomerProfiles" cp 
  WHERE cm."CustomerProfileId" = cp.id;
  ALTER TABLE "CommunityMemberships" DROP COLUMN "CustomerProfileId";
  ALTER TABLE "CommunityMemberships" RENAME COLUMN new_customer_profile_id TO "CustomerProfileId";
  ALTER TABLE "CommunityMemberships" ALTER COLUMN "CustomerProfileId" SET NOT NULL;
  
  -- Invoices
  ALTER TABLE "Invoices" ADD COLUMN new_customer_profile_id text;
  UPDATE "Invoices" i 
  SET new_customer_profile_id = cp."externalId" 
  FROM "CustomerProfiles" cp 
  WHERE i."CustomerProfileId" = cp.id;
  ALTER TABLE "Invoices" DROP COLUMN "CustomerProfileId";
  ALTER TABLE "Invoices" RENAME COLUMN new_customer_profile_id TO "CustomerProfileId";
  ALTER TABLE "Invoices" ALTER COLUMN "CustomerProfileId" SET NOT NULL;

  -- Messages
  ALTER TABLE "Messages" ADD COLUMN new_customer_profile_id text;
  UPDATE "Messages" m 
  SET new_customer_profile_id = cp."externalId" 
  FROM "CustomerProfiles" cp 
  WHERE m."CustomerProfileId" = cp.id;
  ALTER TABLE "Messages" DROP COLUMN "CustomerProfileId";
  ALTER TABLE "Messages" RENAME COLUMN new_customer_profile_id TO "CustomerProfileId";

  -- Purchases
  ALTER TABLE "Purchases" ADD COLUMN new_customer_profile_id text;
  UPDATE "Purchases" p 
  SET new_customer_profile_id = cp."externalId" 
  FROM "CustomerProfiles" cp 
  WHERE p."CustomerProfileId" = cp.id;
  ALTER TABLE "Purchases" DROP COLUMN "CustomerProfileId";
  ALTER TABLE "Purchases" RENAME COLUMN new_customer_profile_id TO "CustomerProfileId";

  -- Testimonials
  ALTER TABLE "Testimonials" ADD COLUMN new_customer_profile_id text;
  UPDATE "Testimonials" t 
  SET new_customer_profile_id = cp."externalId" 
  FROM "CustomerProfiles" cp 
  WHERE t."CustomerProfileId" = cp.id;
  ALTER TABLE "Testimonials" DROP COLUMN "CustomerProfileId";
  ALTER TABLE "Testimonials" RENAME COLUMN new_customer_profile_id TO "CustomerProfileId";
  ALTER TABLE "Testimonials" ALTER COLUMN "CustomerProfileId" SET NOT NULL;
END $$;

-- Update primary table
DO $$
BEGIN
  ALTER TABLE "CustomerProfiles" ADD COLUMN new_id text;
  UPDATE "CustomerProfiles" SET new_id = "externalId";
  ALTER TABLE "CustomerProfiles" DROP CONSTRAINT "CustomerProfiles_pkey";
  ALTER TABLE "CustomerProfiles" DROP COLUMN id;
  ALTER TABLE "CustomerProfiles" RENAME COLUMN new_id TO id;
  ALTER TABLE "CustomerProfiles" ADD PRIMARY KEY (id);
  ALTER TABLE "CustomerProfiles" DROP COLUMN "externalId";
END $$;

-- Add foreign key constraints
ALTER TABLE "CommunityMemberships" ADD CONSTRAINT "CommunityMemberships_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "CustomerProfiles"(id);
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "CustomerProfiles"(id);
ALTER TABLE "Messages" ADD CONSTRAINT "Messages_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "CustomerProfiles"(id);
ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "CustomerProfiles"(id);
ALTER TABLE "Testimonials" ADD CONSTRAINT "Testimonials_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "CustomerProfiles"(id);

-- Recreate RLS policies
CREATE POLICY "Enable read for own communities" ON "CommunityMemberships"
  FOR ALL
  USING (("CommunityId" IN (SELECT id FROM "Communities")) 
      OR ("UserId" = requesting_user_id()) 
      OR ("CustomerProfileId" IN (SELECT id FROM "CustomerProfiles")));

CREATE POLICY "Enable self access via CustomerProfiles" ON "Invoices"
  FOR ALL
  USING (EXISTS (
    SELECT 1
    FROM "CustomerProfiles" cp
    WHERE cp.id = "Invoices"."CustomerProfileId"
  ));

CREATE POLICY "Enable self access via CustomerProfiles" ON "Testimonials"
  FOR ALL
  USING (EXISTS (
    SELECT 1
    FROM "CustomerProfiles" cp
    WHERE cp.id = "Testimonials"."CustomerProfileId"
  ));
