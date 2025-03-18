ALTER TABLE "customer_profiles" DROP CONSTRAINT "customer_profiles_customer_id_customers_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_customer_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_profiles_customer_id_organization_id_unique_idx";--> statement-breakpoint
UPDATE "customer_profiles" SET "name" = "email" where name is null;--> statement-breakpoint
ALTER TABLE "customer_profiles" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_profiles_organization_id_email_unique_idx" ON "customer_profiles" USING btree ("organization_id","email");--> statement-breakpoint
DROP POLICY IF EXISTS "Enable read access via CustomerProfiles" ON "customers";
ALTER TABLE "customer_profiles" DROP COLUMN IF EXISTS "customer_id";