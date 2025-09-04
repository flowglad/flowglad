DROP INDEX IF EXISTS "customers_organization_id_external_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customers_organization_id_invoice_number_base_unique_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_organization_id_external_id_livemode_unique_idx" ON "customers" USING btree ("organization_id","external_id","livemode");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_organization_id_invoice_number_base_livemode_unique_idx" ON "customers" USING btree ("organization_id","invoice_number_base","livemode");