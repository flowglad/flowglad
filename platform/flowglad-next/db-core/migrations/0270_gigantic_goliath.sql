ALTER TABLE "ledger_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX IF EXISTS "customers_organization_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customers_email_organization_id_livemode_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customers_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customers_email_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_organization_id_livemode_idx" ON "customers" USING btree ("organization_id","livemode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_email_idx_gin" ON "customers" USING gin (to_tsvector('english', "email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_name_idx_gin" ON "customers" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_email_idx" ON "customers" USING btree ("email");