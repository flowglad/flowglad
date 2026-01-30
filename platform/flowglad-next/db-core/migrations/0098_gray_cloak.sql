-- Drop RLS policies
DROP POLICY IF EXISTS "Enable all actions for discounts in own organization" ON "Discounts";
DROP POLICY IF EXISTS "Enable self access via CustomerProfiles" ON "Invoices";
DROP POLICY IF EXISTS "Enable select by self OrganizationId" ON "Payments";
DROP POLICY IF EXISTS "Allow self organization records" ON "Variants";
DROP POLICY IF EXISTS "Enable all for self organizations via products" ON "Variants";
DROP POLICY IF EXISTS "Enable access via invoices" ON "InvoiceLineItems";
DROP POLICY IF EXISTS "Enable read for own organizations" ON "DiscountRedemptions";

-- Drop foreign key constraints
ALTER TABLE "DiscountRedemptions" DROP CONSTRAINT "DiscountRedemptions_DiscountId_Discounts_id_fk";
ALTER TABLE "InvoiceLineItems" DROP CONSTRAINT IF EXISTS "InvoiceLineItems_InvoiceId_Invoices_id_fk";
ALTER TABLE "InvoiceLineItems" DROP CONSTRAINT IF EXISTS "InvoiceLineItems_VariantId_Variants_id_fk";
ALTER TABLE "Payments" DROP CONSTRAINT "Payments_InvoiceId_Invoices_id_fk";
ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_VariantId_Variants_id_fk";
ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_DiscountId_Discounts_id_fk";
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_VariantId_Variants_id_fk";
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT IF EXISTS "PurchaseSessions_VariantId_fkey";
ALTER TABLE "PurchaseSessions" DROP CONSTRAINT "PurchaseSessions_DiscountId_Discounts_id_fk";

-- Update primary tables
DO $$
DECLARE
  prefix text;
BEGIN
  -- Discounts
  prefix := 'discount_';
  ALTER TABLE "Discounts" ADD COLUMN new_id text;
  UPDATE "Discounts" SET new_id = CONCAT(prefix, id);
  ALTER TABLE "Discounts" DROP CONSTRAINT "Discounts_pkey";
  ALTER TABLE "Discounts" DROP COLUMN id;
  ALTER TABLE "Discounts" RENAME COLUMN new_id TO id;
  ALTER TABLE "Discounts" ADD PRIMARY KEY (id);

  -- Invoices
  prefix := 'invoice_';
  ALTER TABLE "Invoices" ADD COLUMN new_id text;
  UPDATE "Invoices" SET new_id = CONCAT(prefix, id);
  ALTER TABLE "Invoices" DROP CONSTRAINT IF EXISTS "Invoices_pkey";
  ALTER TABLE "Invoices" DROP CONSTRAINT IF EXISTS "invoices_pkey";
  ALTER TABLE "Invoices" DROP COLUMN id;
  ALTER TABLE "Invoices" RENAME COLUMN new_id TO id;
  ALTER TABLE "Invoices" ADD PRIMARY KEY (id);

  -- Payments
  prefix := 'payment_';
  ALTER TABLE "Payments" ADD COLUMN new_id text;
  UPDATE "Payments" SET new_id = CONCAT(prefix, id);
  ALTER TABLE "Payments" DROP CONSTRAINT "Payments_pkey";
  ALTER TABLE "Payments" DROP COLUMN id;
  ALTER TABLE "Payments" RENAME COLUMN new_id TO id;
  ALTER TABLE "Payments" ADD PRIMARY KEY (id);

  -- Variants
  prefix := 'price_';
  ALTER TABLE "Variants" ADD COLUMN new_id text;
  UPDATE "Variants" SET new_id = CONCAT(prefix, id);
  ALTER TABLE "Variants" DROP CONSTRAINT IF EXISTS "Variants_pkey";
  ALTER TABLE "Variants" DROP CONSTRAINT IF EXISTS "Prices_pkey";
  ALTER TABLE "Variants" DROP COLUMN id;
  ALTER TABLE "Variants" RENAME COLUMN new_id TO id;
  ALTER TABLE "Variants" ADD PRIMARY KEY (id);
END $$;

-- Update foreign keys
DO $$
BEGIN
  -- DiscountRedemptions
  ALTER TABLE "DiscountRedemptions" ADD COLUMN new_discount_id text;
  UPDATE "DiscountRedemptions" dr 
  SET new_discount_id = CONCAT('discount_', dr."DiscountId");
  ALTER TABLE "DiscountRedemptions" DROP COLUMN "DiscountId";
  ALTER TABLE "DiscountRedemptions" RENAME COLUMN new_discount_id TO "DiscountId";
  ALTER TABLE "DiscountRedemptions" ALTER COLUMN "DiscountId" SET NOT NULL;

  -- InvoiceLineItems
  ALTER TABLE "InvoiceLineItems" ADD COLUMN new_invoice_id text;
  UPDATE "InvoiceLineItems" ili 
  SET new_invoice_id = CONCAT('invoice_', ili."InvoiceId");
  ALTER TABLE "InvoiceLineItems" DROP COLUMN "InvoiceId";
  ALTER TABLE "InvoiceLineItems" RENAME COLUMN new_invoice_id TO "InvoiceId";
  ALTER TABLE "InvoiceLineItems" ALTER COLUMN "InvoiceId" SET NOT NULL;

  ALTER TABLE "InvoiceLineItems" ADD COLUMN new_variant_id text;
  UPDATE "InvoiceLineItems" ili 
  SET new_variant_id = CONCAT('price_', ili."VariantId");
  ALTER TABLE "InvoiceLineItems" DROP COLUMN "VariantId";
  ALTER TABLE "InvoiceLineItems" RENAME COLUMN new_variant_id TO "VariantId";

  -- Payments
  ALTER TABLE "Payments" ADD COLUMN new_invoice_id text;
  UPDATE "Payments" p 
  SET new_invoice_id = CONCAT('invoice_', p."InvoiceId");
  ALTER TABLE "Payments" DROP COLUMN "InvoiceId";
  ALTER TABLE "Payments" RENAME COLUMN new_invoice_id TO "InvoiceId";
  ALTER TABLE "Payments" ALTER COLUMN "InvoiceId" SET NOT NULL;

  -- Purchases
  ALTER TABLE "Purchases" ADD COLUMN new_variant_id text;
  UPDATE "Purchases" p 
  SET new_variant_id = CONCAT('price_', p."VariantId");
  ALTER TABLE "Purchases" DROP COLUMN "VariantId";
  ALTER TABLE "Purchases" RENAME COLUMN new_variant_id TO "VariantId";
  ALTER TABLE "Purchases" ALTER COLUMN "VariantId" SET NOT NULL;

  ALTER TABLE "Purchases" ADD COLUMN new_discount_id text;
  UPDATE "Purchases" p 
  SET new_discount_id = CONCAT('discount_', p."DiscountId")
  WHERE p."DiscountId" IS NOT NULL;
  ALTER TABLE "Purchases" DROP COLUMN "DiscountId";
  ALTER TABLE "Purchases" RENAME COLUMN new_discount_id TO "DiscountId";

  -- PurchaseSessions
  ALTER TABLE "PurchaseSessions" ADD COLUMN new_variant_id text;
  UPDATE "PurchaseSessions" ps 
  SET new_variant_id = CONCAT('price_', ps."VariantId");
  ALTER TABLE "PurchaseSessions" DROP COLUMN "VariantId";
  ALTER TABLE "PurchaseSessions" RENAME COLUMN new_variant_id TO "VariantId";
  ALTER TABLE "PurchaseSessions" ALTER COLUMN "VariantId" SET NOT NULL;

  ALTER TABLE "PurchaseSessions" ADD COLUMN new_discount_id text;
  UPDATE "PurchaseSessions" ps 
  SET new_discount_id = CONCAT('discount_', ps."DiscountId")
  WHERE ps."DiscountId" IS NOT NULL;
  ALTER TABLE "PurchaseSessions" DROP COLUMN "DiscountId";
  ALTER TABLE "PurchaseSessions" RENAME COLUMN new_discount_id TO "DiscountId";
END $$;

-- Add foreign key constraints
ALTER TABLE "DiscountRedemptions" ADD CONSTRAINT "DiscountRedemptions_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "Discounts"(id);
ALTER TABLE "InvoiceLineItems" ADD CONSTRAINT "InvoiceLineItems_InvoiceId_Invoices_id_fk" FOREIGN KEY ("InvoiceId") REFERENCES "Invoices"(id);
ALTER TABLE "InvoiceLineItems" ADD CONSTRAINT "InvoiceLineItems_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "Variants"(id);
ALTER TABLE "Payments" ADD CONSTRAINT "Payments_InvoiceId_Invoices_id_fk" FOREIGN KEY ("InvoiceId") REFERENCES "Invoices"(id);
ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "Variants"(id);
ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "Discounts"(id);
ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "Variants"(id);
ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "Discounts"(id);

-- Recreate RLS policies
CREATE POLICY "Enable all actions for discounts in own organization" ON "Discounts"
  FOR ALL
  USING ("OrganizationId" IN (
    SELECT "OrganizationId"
    FROM "Memberships"
  ));

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

CREATE POLICY "Allow self organization records" ON "Variants"
  FOR ALL
  USING ("ProductId" IN (
    SELECT id
    FROM "Products"
  ));

CREATE POLICY "Enable all for self organizations via products" ON "Variants"
  FOR ALL
  USING ("ProductId" IN (
    SELECT id
    FROM "Products"
  ));

CREATE POLICY "Enable access via invoices" ON "InvoiceLineItems"
  FOR ALL
  USING ("InvoiceId" IN (
    SELECT id
    FROM "Invoices"
  ));

CREATE POLICY "Enable read for own organizations" ON "DiscountRedemptions"
  FOR ALL
  USING ("DiscountId" IN (
    SELECT id
    FROM "Discounts"
  ));


-- ALTER TABLE "DiscountRedemptions" DROP CONSTRAINT "DiscountRedemptions_DiscountId_Discounts_id_fk";
-- ALTER TABLE "InvoiceLineItems" DROP CONSTRAINT IF EXISTS "InvoiceLineItems_InvoiceId_Invoices_id_fk";
-- ALTER TABLE "InvoiceLineItems" DROP CONSTRAINT IF EXISTS "InvoiceLineItems_VariantId_Variants_id_fk";
-- ALTER TABLE "Payments" DROP CONSTRAINT "Payments_InvoiceId_Invoices_id_fk";
-- ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_VariantId_Variants_id_fk";
-- ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_DiscountId_Discounts_id_fk";
-- ALTER TABLE "PurchaseSessions" DROP CONSTRAINT "PurchaseSessions_VariantId_Variants_id_fk";
-- ALTER TABLE "PurchaseSessions" DROP CONSTRAINT "PurchaseSessions_DiscountId_Discounts_id_fk";

-- -- Step 2: Update foreign key references in child tables
-- UPDATE public."DiscountRedemptions" SET "DiscountId" = (SELECT "externalId" FROM public."Discounts" WHERE "Discounts".id = "DiscountRedemptions"."DiscountId");
-- UPDATE public."InvoiceLineItems" SET "InvoiceId" = (SELECT "externalId" FROM public."Invoices" WHERE "Invoices".id = "InvoiceLineItems"."InvoiceId");
-- UPDATE public."InvoiceLineItems" SET "VariantId" = (SELECT "externalId" FROM public."Variants" WHERE "Variants".id = "InvoiceLineItems"."VariantId");
-- UPDATE public."Payments" SET "InvoiceId" = (SELECT "externalId" FROM public."Invoices" WHERE "Invoices".id = "Payments"."InvoiceId");
-- UPDATE public."Purchases" SET "VariantId" = (SELECT "externalId" FROM public."Variants" WHERE "Variants".id = "Purchases"."VariantId");
-- UPDATE public."Purchases" SET "DiscountId" = (SELECT "externalId" FROM public."Discounts" WHERE "Discounts".id = "Purchases"."DiscountId");
-- UPDATE public."PurchaseSessions" SET "VariantId" = (SELECT "externalId" FROM public."Variants" WHERE "Variants".id = "PurchaseSessions"."VariantId");
-- UPDATE public."PurchaseSessions" SET "DiscountId" = (SELECT "externalId" FROM public."Discounts" WHERE "Discounts".id = "PurchaseSessions"."DiscountId");

-- -- Step 1: Update the id fields to match externalId
-- UPDATE public."Discounts" SET id = "externalId";
-- UPDATE public."Invoices" SET id = "externalId";
-- UPDATE public."Payments" SET id = "externalId";
-- UPDATE public."Variants" SET id = "externalId";

-- -- Step 3: Restore constraints
-- ALTER TABLE "DiscountRedemptions" ADD CONSTRAINT "DiscountRedemptions_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "Discounts"(id);
-- ALTER TABLE "InvoiceLineItems" ADD CONSTRAINT "InvoiceLineItems_InvoiceId_Invoices_id_fk" FOREIGN KEY ("InvoiceId") REFERENCES "Invoices"(id);
-- ALTER TABLE "InvoiceLineItems" ADD CONSTRAINT "InvoiceLineItems_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "Variants"(id);
-- ALTER TABLE "Payments" ADD CONSTRAINT "Payments_InvoiceId_Invoices_id_fk" FOREIGN KEY ("InvoiceId") REFERENCES "Invoices"(id);
-- ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "Variants"(id);
-- ALTER TABLE "Purchases" ADD CONSTRAINT "Purchases_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "Discounts"(id);
-- ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_VariantId_Variants_id_fk" FOREIGN KEY ("VariantId") REFERENCES "Variants"(id);
-- ALTER TABLE "PurchaseSessions" ADD CONSTRAINT "PurchaseSessions_DiscountId_Discounts_id_fk" FOREIGN KEY ("DiscountId") REFERENCES "Discounts"(id);

-- -- Drop externalId columns since they are no longer needed
-- ALTER TABLE "Discounts" DROP COLUMN IF EXISTS "externalId";
-- ALTER TABLE "Invoices" DROP COLUMN IF EXISTS "externalId"; 
-- ALTER TABLE "Payments" DROP COLUMN IF EXISTS "externalId";
-- ALTER TABLE "Variants" DROP COLUMN IF EXISTS "externalId";
