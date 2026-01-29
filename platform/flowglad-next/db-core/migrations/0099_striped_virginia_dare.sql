-- Drop policies
DROP POLICY IF EXISTS "Enable read for own communities" ON "CommunityMemberships";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "DiscountRedemptions";
DROP POLICY IF EXISTS "Enable self access via CustomerProfiles" ON "Invoices";
DROP POLICY IF EXISTS "Enable select by self OrganizationId" ON "Payments";
DROP POLICY IF EXISTS "Enable self organization projects access" ON "Purchases";

-- Drop foreign key constraints
ALTER TABLE "CommunityMemberships" DROP CONSTRAINT IF EXISTS "CommunityMemberships_PurchaseId_Purchases_id_fk";
ALTER TABLE "DiscountRedemptions" DROP CONSTRAINT IF EXISTS "DiscountRedemptions_PurchaseId_Purchases_id_fk";
ALTER TABLE "Invoices" DROP CONSTRAINT IF EXISTS "Invoices_PurchaseId_Purchases_id_fk";
ALTER TABLE "Payments" DROP CONSTRAINT IF EXISTS "Payments_PurchaseId_Purchases_id_fk";
ALTER TABLE "PurchaseAccessSessions" DROP CONSTRAINT IF EXISTS "PurchaseAccessSessions_PurchaseId_Purchases_id_fk";
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_PurchaseId_Purchases_id_fk";

-- Update primary table
DO $$
BEGIN
  ALTER TABLE "Purchases" ADD COLUMN new_id text;
  UPDATE "Purchases" SET new_id = "externalId";
  ALTER TABLE "Purchases" DROP CONSTRAINT "Deals_pkey";
  ALTER TABLE "Purchases" DROP COLUMN id;
  ALTER TABLE "Purchases" RENAME COLUMN new_id TO id;
  ALTER TABLE "Purchases" ADD PRIMARY KEY (id);
  ALTER TABLE "Purchases" DROP COLUMN "externalId";
END $$;

-- Update foreign keys
DO $$
BEGIN
  -- CommunityMemberships
  ALTER TABLE "CommunityMemberships" ADD COLUMN new_purchase_id text;
  UPDATE "CommunityMemberships" cm 
  SET new_purchase_id = p.id 
  FROM "Purchases" p 
  WHERE CAST(cm."PurchaseId" AS text) = p.id;
  ALTER TABLE "CommunityMemberships" DROP COLUMN "PurchaseId";
  ALTER TABLE "CommunityMemberships" RENAME COLUMN new_purchase_id TO "PurchaseId";

  -- DiscountRedemptions
  ALTER TABLE "DiscountRedemptions" ADD COLUMN new_purchase_id text;
  UPDATE "DiscountRedemptions" dr 
  SET new_purchase_id = p.id 
  FROM "Purchases" p 
  WHERE CAST(dr."PurchaseId" AS text) = p.id;
  ALTER TABLE "DiscountRedemptions" DROP COLUMN "PurchaseId";
  ALTER TABLE "DiscountRedemptions" RENAME COLUMN new_purchase_id TO "PurchaseId";

  -- Invoices
  ALTER TABLE "Invoices" ADD COLUMN new_purchase_id text;
  UPDATE "Invoices" i 
  SET new_purchase_id = p.id 
  FROM "Purchases" p 
  WHERE CAST(i."PurchaseId" AS text) = p.id;
  ALTER TABLE "Invoices" DROP COLUMN "PurchaseId";
  ALTER TABLE "Invoices" RENAME COLUMN new_purchase_id TO "PurchaseId";

  -- Payments
  ALTER TABLE "Payments" ADD COLUMN new_purchase_id text;
  UPDATE "Payments" pay 
  SET new_purchase_id = p.id 
  FROM "Purchases" p 
  WHERE CAST(pay."PurchaseId" AS text) = p.id;
  ALTER TABLE "Payments" DROP COLUMN "PurchaseId";
  ALTER TABLE "Payments" RENAME COLUMN new_purchase_id TO "PurchaseId";

  -- PurchaseAccessSessions
  ALTER TABLE "PurchaseAccessSessions" ADD COLUMN new_purchase_id text;
  UPDATE "PurchaseAccessSessions" pas 
  SET new_purchase_id = p.id 
  FROM "Purchases" p 
  WHERE CAST(pas."PurchaseId" AS text) = p.id;
  ALTER TABLE "PurchaseAccessSessions" DROP COLUMN "PurchaseId";
  ALTER TABLE "PurchaseAccessSessions" RENAME COLUMN new_purchase_id TO "PurchaseId";
  ALTER TABLE "PurchaseAccessSessions" ALTER COLUMN "PurchaseId" SET NOT NULL;

  -- PurchaseSessions
  ALTER TABLE "PurchaseSessions" ADD COLUMN new_purchase_id text;
  UPDATE "PurchaseSessions" ps 
  SET new_purchase_id = p.id
  FROM "Purchases" p 
  WHERE CAST(ps."PurchaseId" AS text) = p.id;
  ALTER TABLE "PurchaseSessions" DROP COLUMN "PurchaseId";
  ALTER TABLE "PurchaseSessions" RENAME COLUMN new_purchase_id TO "PurchaseId";
END $$;

-- Add foreign key constraints
ALTER TABLE "CommunityMemberships" ADD CONSTRAINT "CommunityMemberships_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "Purchases"(id);
ALTER TABLE "DiscountRedemptions" ADD CONSTRAINT "DiscountRedemptions_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "Purchases"(id);
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "Purchases"(id);
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "Purchases"(id);
ALTER TABLE "PurchaseAccessSessions" ADD CONSTRAINT "PurchaseAccessSessions_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "Purchases"(id);
ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "Purchases"(id);

-- Recreate RLS policies
CREATE POLICY "Enable read for own communities" ON "CommunityMemberships"
  FOR ALL
  USING (("CommunityId" IN (SELECT id FROM "Communities")) 
      OR ("UserId" = requesting_user_id()) 
      OR ("CustomerProfileId" IN (SELECT id FROM "CustomerProfiles")));

CREATE POLICY "Enable read for own organizations" ON "DiscountRedemptions"
  FOR ALL
  USING ("DiscountId" IN (SELECT id FROM "Discounts"));

CREATE POLICY "Enable self access via CustomerProfiles" ON "Invoices"
  FOR ALL
  USING (EXISTS (
    SELECT 1
    FROM "CustomerProfiles" cp
    WHERE cp.id = "Invoices"."CustomerProfileId"
  ));

CREATE POLICY "Enable select by self OrganizationId" ON "Payments"
  FOR SELECT
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable self organization projects access" ON "Purchases"
  FOR ALL
  USING (EXISTS (
    SELECT 1
    FROM "Organizations" o
    WHERE o.id = "Purchases"."OrganizationId"
  ));