-- First drop RLS policies that reference ids we're changing
DROP POLICY "Enable read for own organizations" ON "Communities";
DROP POLICY "Enable read for own organizations" ON "Integrations";
DROP POLICY "Enable all actions for flows in own organization" ON "FlowSteps";
DROP POLICY IF EXISTS "Enable access via invoices" ON "InvoiceLineItems";
DROP POLICY IF EXISTS "Enable self access via CustomerProfiles" ON "Testimonials";

-- First verify all externalIds are ready
DO $$ 
BEGIN
 -- Verify each table's externalId
 IF EXISTS (
   SELECT 1 FROM "Flows" 
   WHERE "externalId" IS NULL OR "externalId" = ''
 ) THEN
   RAISE EXCEPTION 'Data validation failed - found null or empty externalIds in Flows';
 END IF;

 IF EXISTS (
   SELECT 1 FROM "Integrations" 
   WHERE "externalId" IS NULL OR "externalId" = ''
 ) THEN
   RAISE EXCEPTION 'Data validation failed - found null or empty externalIds in Integrations';
 END IF;
END $$;

-- Add new columns for foreign keys
ALTER TABLE "FlowSteps" ADD COLUMN "FlowNewId" text;
ALTER TABLE "Messages" ADD COLUMN "OrganizationMemberNewId" text;
ALTER TABLE "IntegrationSessions" ADD COLUMN "IntegrationNewId" text;
ALTER TABLE "Communities" ADD COLUMN "IntegrationNewId" text;
ALTER TABLE "InvoiceLineItems" ADD COLUMN "VariantNewId" text;
ALTER TABLE "PurchaseAccessSessions" ADD COLUMN "PurchaseNewId" text;

-- Populate new foreign key columns
UPDATE "FlowSteps" fs
SET "FlowNewId" = (
 SELECT f."externalId"
 FROM "Flows" f
 WHERE f.id = fs."FlowId"
);

UPDATE "Messages" m
SET "OrganizationMemberNewId" = (
 SELECT mem."externalId"
 FROM "Memberships" mem
 WHERE mem.id = m."OrganizationMemberId"
);

UPDATE "IntegrationSessions"
SET "IntegrationNewId" = (
 SELECT i."externalId"
 FROM "Integrations" i
 WHERE i.id = "IntegrationSessions"."IntegrationId"
);

UPDATE "Communities" c
SET "IntegrationNewId" = (
 SELECT i."externalId"
 FROM "Integrations" i
 WHERE i.id = c."IntegrationId"
);

-- Drop existing foreign key constraints
ALTER TABLE "FlowSteps" DROP CONSTRAINT "FlowSteps_FlowId_Flows_id_fk";
ALTER TABLE "Messages" DROP CONSTRAINT "Messages_OrganizationMemberId_Memberships_id_fk";
ALTER TABLE "IntegrationSessions" DROP CONSTRAINT "IntegrationSessions_IntegrationId_Integrations_id_fk";
ALTER TABLE "Communities" DROP CONSTRAINT "Communities_IntegrationId_Integrations_id_fk";
ALTER TABLE "InvoiceLineItems" DROP CONSTRAINT "InvoiceLineItems_InvoiceId_Invoices_id_fk";
ALTER TABLE "InvoiceLineItems" DROP CONSTRAINT "InvoiceLineItems_VariantId_Variants_id_fk";

-- Change id columns to text using externalId values
ALTER TABLE "Flows" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "Integrations" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "IntegrationSessions" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "InvoiceLineItems" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "Links" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "Memberships" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "PurchaseAccessSessions" ALTER COLUMN "id" TYPE text USING "externalId";
ALTER TABLE "Testimonials" ALTER COLUMN "id" TYPE text USING "externalId";

-- Add new foreign key constraints
ALTER TABLE "FlowSteps" ADD CONSTRAINT "FlowSteps_FlowId_Flows_id_fkey"
 FOREIGN KEY ("FlowNewId") REFERENCES "Flows" ("id");

ALTER TABLE "IntegrationSessions" ADD CONSTRAINT "IntegrationSessions_IntegrationId_Integrations_id_fkey"
 FOREIGN KEY ("IntegrationNewId") REFERENCES "Integrations" ("id");

ALTER TABLE "Communities" ADD CONSTRAINT "Communities_IntegrationId_Integrations_id_fkey"
 FOREIGN KEY ("IntegrationNewId") REFERENCES "Integrations" ("id");

-- Drop old columns and rename new ones
ALTER TABLE "FlowSteps" DROP COLUMN "FlowId";
ALTER TABLE "FlowSteps" RENAME COLUMN "FlowNewId" TO "FlowId";

ALTER TABLE "IntegrationSessions" DROP COLUMN "IntegrationId";
ALTER TABLE "IntegrationSessions" RENAME COLUMN "IntegrationNewId" TO "IntegrationId";

ALTER TABLE "Communities" DROP COLUMN "IntegrationId";
ALTER TABLE "Communities" RENAME COLUMN "IntegrationNewId" TO "IntegrationId";

-- Drop the membership columns you specified
ALTER TABLE "Memberships" DROP COLUMN IF EXISTS "slackUserId";
ALTER TABLE "Memberships" DROP COLUMN IF EXISTS "calAPIKey";
ALTER TABLE "Memberships" DROP COLUMN IF EXISTS "calEventTypeId";
ALTER TABLE "Memberships" DROP COLUMN IF EXISTS "calWebhookSecret";

-- Drop all externalId columns
ALTER TABLE "Flows" DROP COLUMN "externalId";
ALTER TABLE "Integrations" DROP COLUMN "externalId";
ALTER TABLE "IntegrationSessions" DROP COLUMN "externalId";
ALTER TABLE "InvoiceLineItems" DROP COLUMN "externalId";
ALTER TABLE "Links" DROP COLUMN "externalId";
ALTER TABLE "Memberships" DROP COLUMN "externalId";
ALTER TABLE "PurchaseAccessSessions" DROP COLUMN "externalId";
ALTER TABLE "Testimonials" DROP COLUMN "externalId";

-- Recreate RLS policies
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

CREATE POLICY "Enable all for self organizations" ON "Integrations"
 FOR ALL
 USING ("OrganizationId" IN (
   SELECT "OrganizationId"
   FROM "Memberships"
 ));

CREATE POLICY "Enable read for own organizations" ON "Integrations"
 FOR ALL
 USING ("OrganizationId" IN (
   SELECT "OrganizationId"
   FROM "Memberships"
 ) OR "UserId" = requesting_user_id());

CREATE POLICY "Enable all for self organizations" ON "IntegrationSessions"
 FOR ALL
 USING ("IntegrationId" IN (
   SELECT id
   FROM "Integrations"
 ));

CREATE POLICY "Enable access via invoices" ON "InvoiceLineItems"
 FOR ALL
 USING (EXISTS (
   SELECT 1
   FROM "Invoices" i
   WHERE i.id = "InvoiceLineItems"."InvoiceId"
 ));

CREATE POLICY "Enable self access via CustomerProfiles" ON "Testimonials"
 FOR ALL
 USING (EXISTS (
   SELECT 1
   FROM "CustomerProfiles" cp
   WHERE cp.id = "Testimonials"."CustomerProfileId"
 ));

-- Drop FlowSteps table at the very end
DROP TABLE "FlowSteps";
