DO $$ BEGIN
    CREATE TYPE "SubscriptionItemType" AS ENUM ('usage', 'static');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "billing_period_items" ADD COLUMN "type" "SubscriptionItemType";--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "type" "SubscriptionItemType";--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "type" "SubscriptionItemType";--> statement-breakpoint
UPDATE "billing_period_items" SET "type" = 'static';--> statement-breakpoint
UPDATE "subscription_items" SET "type" = 'static';--> statement-breakpoint
UPDATE "invoice_line_items" SET "type" = 'static';--> statement-breakpoint
ALTER TABLE "billing_period_items" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "type" SET NOT NULL;-->

ALTER TABLE "billing_period_items" ADD COLUMN "usage_events_per_unit" integer;--> statement-breakpoint
ALTER TABLE "billing_period_items" ADD COLUMN "usage_meter_id" text;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "billing_run_id" text;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "ledger_account_id" text;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "ledger_account_credit" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billing_run_id" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "claimed_by_billing_run_id" text;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "usage_events_per_unit" integer;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "usage_meter_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_period_items" ADD CONSTRAINT "billing_period_items_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_billing_run_id_billing_runs_id_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."billing_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_run_id_billing_runs_id_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."billing_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_claimed_by_billing_run_id_billing_runs_id_fk" FOREIGN KEY ("claimed_by_billing_run_id") REFERENCES "public"."billing_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_period_items_usage_meter_id_idx" ON "billing_period_items" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_billing_run_id_idx" ON "invoice_line_items" USING btree ("billing_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_ledger_account_id_idx" ON "invoice_line_items" USING btree ("ledger_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_billing_run_id_idx" ON "invoices" USING btree ("billing_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_claimed_by_billing_run_id_idx" ON "ledger_entries" USING btree ("claimed_by_billing_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_items_usage_meter_id_idx" ON "subscription_items" USING btree ("usage_meter_id");--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN IF EXISTS "calculation_run_id";