UPDATE "Invoices" i
SET "OrganizationId" = p."OrganizationId"
FROM "Purchases" p
WHERE i."PurchaseId" = p.id;--> statement-breakpoint

ALTER TABLE "Invoices" ALTER COLUMN "OrganizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "CustomerProfiles" ADD COLUMN "billingAddress" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Invoices_OrganizationId_idx" ON "Invoices" USING btree ("OrganizationId");