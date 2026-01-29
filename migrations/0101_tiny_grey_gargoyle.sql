-- Drop policies
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Communities";
DROP POLICY IF EXISTS "Enable all actions for discounts in own organization" ON "Discounts";
DROP POLICY IF EXISTS "Enable all actions for own organization" ON "Events";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Files";
DROP POLICY IF EXISTS "Enable all actions for own organization" ON "Flows";
DROP POLICY IF EXISTS "Enable all for own organizations" ON "Forms";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Integrations";
DROP POLICY IF EXISTS "Enable all for self organizations" ON "Integrations";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Links";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Products";
DROP POLICY IF EXISTS "Enable All" ON "Products";
DROP POLICY IF EXISTS "Enable self organization projects access" ON "Purchases";
DROP POLICY IF EXISTS "Enable updates for organizations where you're a member" ON "Organizations";
DROP POLICY IF EXISTS "Self-Read for Organizations by Memberships" ON "Organizations";
DROP POLICY IF EXISTS "Enable all actions for discounts in own organization" ON "Discounts";
DROP POLICY IF EXISTS "Enable access via organizations" ON "CustomerProfiles";
DROP POLICY IF EXISTS "Enable updates for organizations where you're a member" ON "Organizations";
DROP POLICY IF EXISTS "Self-Read for Organizations by Memberships" ON "Organizations";
DROP POLICY IF EXISTS "Enable all actions for own organization" ON "Flows";
DROP POLICY IF EXISTS "Enable all actions for own organization" ON "Events";
DROP POLICY IF EXISTS "Enable All" ON "Products";
DROP POLICY IF EXISTS "Enable select by self OrganizationId" ON "Payments";
DROP POLICY IF EXISTS "Enable self organization projects access" ON "Purchases";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Products";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Files";
DROP POLICY IF EXISTS "Enable all for own organizations" ON "Forms";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Links";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Communities";
DROP POLICY IF EXISTS "Enable all for self organizations" ON "Integrations";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "Integrations";
DROP POLICY IF EXISTS "Enable self-read via memberships" ON "Organizations";
DROP POLICY IF EXISTS "Allow update for organizations where you're a member" ON "Organizations";

-- Drop foreign key constraints
ALTER TABLE "Communities" DROP CONSTRAINT IF EXISTS "Communities_OrganizationId_Organizations_id_fk";
ALTER TABLE "Discounts" DROP CONSTRAINT IF EXISTS "Discounts_OrganizationId_Organizations_id_fk";
ALTER TABLE "Events" DROP CONSTRAINT IF EXISTS "Events_OrganizationId_Organizations_id_fk";
ALTER TABLE "Files" DROP CONSTRAINT IF EXISTS "Files_OrganizationId_Organizations_id_fk";
ALTER TABLE "Flows" DROP CONSTRAINT IF EXISTS "Flows_OrganizationId_Organizations_id_fk";
ALTER TABLE "Forms" DROP CONSTRAINT IF EXISTS "Forms_OrganizationId_Organizations_id_fk";
ALTER TABLE "Integrations" DROP CONSTRAINT IF EXISTS "Integrations_OrganizationId_Organizations_id_fk";
ALTER TABLE "Invoices" DROP CONSTRAINT IF EXISTS "Invoices_OrganizationId_Organizations_id_fk";
ALTER TABLE "Links" DROP CONSTRAINT IF EXISTS "Links_OrganizationId_Organizations_id_fk";
ALTER TABLE "Memberships" DROP CONSTRAINT IF EXISTS "Memberships_OrganizationId_Organizations_id_fk";
ALTER TABLE "Products" DROP CONSTRAINT IF EXISTS "Products_OrganizationId_Organizations_id_fk";
ALTER TABLE "Purchases" DROP CONSTRAINT IF EXISTS "Purchases_OrganizationId_Organizations_id_fk";
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_OrganizationId_Organizations_id_fk";
ALTER TABLE "Testimonials" DROP CONSTRAINT IF EXISTS "Testimonials_OrganizationId_Organizations_id_fk";
ALTER TABLE "CustomerProfiles" DROP CONSTRAINT IF EXISTS "CustomerProfiles_OrganizationId_Organizations_id_fk";
ALTER TABLE "Payments" DROP CONSTRAINT IF EXISTS "Payments_OrganizationId_Organizations_id_fk";

-- Update foreign keys
DO $$
BEGIN
  -- Communities
  ALTER TABLE "Communities" ADD COLUMN new_organization_id text;
  UPDATE "Communities" c 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE c."OrganizationId" = o.id;
  ALTER TABLE "Communities" DROP COLUMN "OrganizationId";
  ALTER TABLE "Communities" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Communities" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- CustomerProfiles
  ALTER TABLE "CustomerProfiles" ADD COLUMN new_organization_id text;
  UPDATE "CustomerProfiles" cp 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE cp."OrganizationId" = o.id;
  ALTER TABLE "CustomerProfiles" DROP COLUMN "OrganizationId";
  ALTER TABLE "CustomerProfiles" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "CustomerProfiles" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Discounts
  ALTER TABLE "Discounts" ADD COLUMN new_organization_id text;
  UPDATE "Discounts" d 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE d."OrganizationId" = o.id;
  ALTER TABLE "Discounts" DROP COLUMN "OrganizationId";
  ALTER TABLE "Discounts" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Discounts" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Events
  ALTER TABLE "Events" ADD COLUMN new_organization_id text;
  UPDATE "Events" e 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE e."OrganizationId" = o.id;
  ALTER TABLE "Events" DROP COLUMN "OrganizationId";
  ALTER TABLE "Events" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Events" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Files
  ALTER TABLE "Files" ADD COLUMN new_organization_id text;
  UPDATE "Files" f 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE f."OrganizationId" = o.id;
  ALTER TABLE "Files" DROP COLUMN "OrganizationId";
  ALTER TABLE "Files" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Files" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Flows
  ALTER TABLE "Flows" ADD COLUMN new_organization_id text;
  UPDATE "Flows" fl 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE fl."OrganizationId" = o.id;
  ALTER TABLE "Flows" DROP COLUMN "OrganizationId";
  ALTER TABLE "Flows" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Flows" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Forms
  ALTER TABLE "Forms" ADD COLUMN new_organization_id text;
  UPDATE "Forms" fo 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE fo."OrganizationId" = o.id;
  ALTER TABLE "Forms" DROP COLUMN "OrganizationId";
  ALTER TABLE "Forms" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Forms" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Integrations
  ALTER TABLE "Integrations" ADD COLUMN new_organization_id text;
  UPDATE "Integrations" i 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE i."OrganizationId" = o.id;
  ALTER TABLE "Integrations" DROP COLUMN "OrganizationId";
  ALTER TABLE "Integrations" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Integrations" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Invoices
  ALTER TABLE "Invoices" ADD COLUMN new_organization_id text;
  UPDATE "Invoices" inv 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE inv."OrganizationId" = o.id;
  ALTER TABLE "Invoices" DROP COLUMN "OrganizationId";
  ALTER TABLE "Invoices" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Invoices" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Links
  ALTER TABLE "Links" ADD COLUMN new_organization_id text;
  UPDATE "Links" l 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE l."OrganizationId" = o.id;
  ALTER TABLE "Links" DROP COLUMN "OrganizationId";
  ALTER TABLE "Links" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Links" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Memberships
  ALTER TABLE "Memberships" ADD COLUMN new_organization_id text;
  UPDATE "Memberships" m 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE m."OrganizationId" = o.id;
  ALTER TABLE "Memberships" DROP COLUMN "OrganizationId";
  ALTER TABLE "Memberships" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Memberships" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Payments
  ALTER TABLE "Payments" ADD COLUMN new_organization_id text;
  UPDATE "Payments" p 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE p."OrganizationId" = o.id;
  ALTER TABLE "Payments" DROP COLUMN "OrganizationId";
  ALTER TABLE "Payments" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Payments" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Products
  ALTER TABLE "Products" ADD COLUMN new_organization_id text;
  UPDATE "Products" pr 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE pr."OrganizationId" = o.id;
  ALTER TABLE "Products" DROP COLUMN "OrganizationId";
  ALTER TABLE "Products" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Products" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Purchases
  ALTER TABLE "Purchases" ADD COLUMN new_organization_id text;
  UPDATE "Purchases" pu 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE pu."OrganizationId" = o.id;
  ALTER TABLE "Purchases" DROP COLUMN "OrganizationId";
  ALTER TABLE "Purchases" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Purchases" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- PurchaseSessions
  ALTER TABLE "PurchaseSessions" ADD COLUMN new_organization_id text;
  UPDATE "PurchaseSessions" ps 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE ps."OrganizationId" = o.id;
  ALTER TABLE "PurchaseSessions" DROP COLUMN "OrganizationId";
  ALTER TABLE "PurchaseSessions" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "PurchaseSessions" ALTER COLUMN "OrganizationId" SET NOT NULL;

  -- Testimonials
  ALTER TABLE "Testimonials" ADD COLUMN new_organization_id text;
  UPDATE "Testimonials" t 
  SET new_organization_id = o."externalId" 
  FROM "Organizations" o 
  WHERE t."OrganizationId" = o.id;
  ALTER TABLE "Testimonials" DROP COLUMN "OrganizationId";
  ALTER TABLE "Testimonials" RENAME COLUMN new_organization_id TO "OrganizationId";
  ALTER TABLE "Testimonials" ALTER COLUMN "OrganizationId" SET NOT NULL;
END $$;

-- Update primary table
DO $$
BEGIN
  ALTER TABLE "Organizations" ADD COLUMN new_id text;
  UPDATE "Organizations" SET new_id = "externalId";
  ALTER TABLE "Organizations" DROP CONSTRAINT "Organizations_pkey";
  ALTER TABLE "Organizations" DROP COLUMN id;
  ALTER TABLE "Organizations" RENAME COLUMN new_id TO id;
  ALTER TABLE "Organizations" ADD PRIMARY KEY (id);
  ALTER TABLE "Organizations" DROP COLUMN "externalId";
END $$;

-- Add foreign key constraints
ALTER TABLE "Communities" ADD CONSTRAINT "Communities_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "CustomerProfiles" ADD CONSTRAINT "CustomerProfiles_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Discounts" ADD CONSTRAINT "Discounts_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Events" ADD CONSTRAINT "Events_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Files" ADD CONSTRAINT "Files_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Flows" ADD CONSTRAINT "Flows_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Forms" ADD CONSTRAINT "Forms_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Integrations" ADD CONSTRAINT "Integrations_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Links" ADD CONSTRAINT "Links_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Memberships" ADD CONSTRAINT "Memberships_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Products" ADD CONSTRAINT "Products_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);
ALTER TABLE "Testimonials" ADD CONSTRAINT "Testimonials_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations"(id);

-- Recreate RLS policies
CREATE POLICY "Enable read for own organizations" ON "Communities"
  FOR ALL
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable all actions for discounts in own organization" ON "Discounts"
  FOR ALL
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable all actions for own organization" ON "Events"
  FOR SELECT
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable read for own organizations" ON "Files"
  FOR ALL
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable all actions for own organization" ON "Flows"
  FOR ALL
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable all for own organizations" ON "Forms"
  FOR ALL
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable read for own organizations" ON "Integrations"
  FOR ALL
  USING (("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  )) OR ("UserId" = requesting_user_id()));

CREATE POLICY "Enable all for self organizations" ON "Integrations"
  FOR ALL
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable read for own organizations" ON "Links"
  FOR ALL
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable read for own organizations" ON "Products"
  FOR ALL
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Enable All" ON "Products"
  FOR ALL
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

CREATE POLICY "Enable updates for organizations where you're a member" ON "Organizations"
  FOR UPDATE
  USING (id IN (
    SELECT "OrganizationId"
    FROM "Memberships"
    WHERE "UserId" = requesting_user_id()
  ));

CREATE POLICY "Self-Read for Organizations by Memberships" ON "Organizations"
  FOR SELECT
  USING (id IN (
    SELECT "OrganizationId"
    FROM "Memberships"
    WHERE "UserId" = requesting_user_id()
  ));

CREATE POLICY "Enable access via organizations" ON "CustomerProfiles"
  FOR ALL
  USING (EXISTS (
    SELECT 1
    FROM "Organizations" o
    WHERE o.id = "CustomerProfiles"."OrganizationId"
  ));

CREATE POLICY "Enable select by self OrganizationId" ON "Payments"
  FOR SELECT
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

CREATE POLICY "Allow update for organizations where you're a member" ON "Organizations"
  FOR UPDATE
  USING (id IN (
    SELECT "OrganizationId"
    FROM "Memberships"
    WHERE "UserId" = requesting_user_id()
  ));
