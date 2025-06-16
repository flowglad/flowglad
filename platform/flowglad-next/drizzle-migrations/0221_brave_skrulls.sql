DO $$ BEGIN
    ALTER TYPE "UsageCreditSourceReferenceType" ADD VALUE IF NOT EXISTS 'billing_period_transition';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "LedgerEntryType" AS ENUM (
        'usage_cost',
        'payment_initiated', 
        'payment_failed',
        'credit_grant_recognized',
        'credit_balance_adjusted',
        'credit_grant_expired',
        'payment_refunded',
        'billing_adjustment',
        'usage_credit_application_debit_from_credit_balance',
        'usage_credit_application_credit_towards_usage_cost'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "UsageCreditApplicationStatus" AS ENUM (
        'pending',
        'posted'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "SubscriptionItemType" AS ENUM (
        'usage',
        'static'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "LedgerTransactionType" AS ENUM (
        'usage_event_processed',
        'credit_grant_recognized',
        'billing_period_transition',
        'admin_credit_adjusted',
        'credit_grant_expired',
        'payment_refunded',
        'billing_recalculated',
        'settle_invoice_usage_costs'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_source_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "ledger_transactions" DROP CONSTRAINT IF EXISTS "ledger_transactions_usage_meter_id_usage_meters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "discounts_code_organization_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_entries_source_payment_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_usage_meter_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_idempotency_key_usage_meter_id_subscription_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_credit_applications_calculation_run_id_idx";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN "entry_type";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "entry_type" "LedgerEntryType" NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credits" ALTER COLUMN "usage_meter_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_period_items" ADD COLUMN "usage_events_per_unit" integer;--> statement-breakpoint
ALTER TABLE "billing_period_items" ADD COLUMN "usage_meter_id" text;--> statement-breakpoint
ALTER TABLE "billing_period_items" ADD COLUMN "type" "SubscriptionItemType";--> statement-breakpoint
UPDATE "billing_period_items" SET "type" = 'static';--> statement-breakpoint
ALTER TABLE "billing_period_items" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "billing_run_id" text;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "ledger_account_id" text;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "ledger_account_credit" integer;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "type" "SubscriptionItemType";--> statement-breakpoint
UPDATE "invoice_line_items" SET "type" = 'static';--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billing_run_id" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "source_refund_id" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "claimed_by_billing_run_id" text;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "type" "LedgerTransactionType" NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "usage_events_per_unit" integer;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "usage_meter_id" text;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD COLUMN "type" "SubscriptionItemType";--> statement-breakpoint
UPDATE "subscription_items" SET "type" = 'static';--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ADD COLUMN "status" "UsageCreditApplicationStatus";--> statement-breakpoint
UPDATE "usage_credit_applications" SET "status" = 'posted';--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ADD COLUMN "usage_event_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credits" ADD COLUMN "payment_id" text;--> statement-breakpoint
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
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_refund_id_refunds_id_fk" FOREIGN KEY ("source_refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;
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
DO $$ BEGIN
 ALTER TABLE "usage_credit_applications" ADD CONSTRAINT "usage_credit_applications_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_period_items_usage_meter_id_idx" ON "billing_period_items" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discounts_code_organization_id_livemode_unique_idx" ON "discounts" USING btree ("code","organization_id","livemode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_billing_run_id_idx" ON "invoice_line_items" USING btree ("billing_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_ledger_account_id_idx" ON "invoice_line_items" USING btree ("ledger_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_billing_run_id_idx" ON "invoices" USING btree ("billing_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_claimed_by_billing_run_id_idx" ON "ledger_entries" USING btree ("claimed_by_billing_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_idempotency_key_subscription_id_unique_idx" ON "ledger_transactions" USING btree ("idempotency_key","subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_type_initiating_source_type_initiating_source_id_livemode_organization_id_unique_idx" ON "ledger_transactions" USING btree ("type","initiating_source_type","initiating_source_id","livemode","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_items_usage_meter_id_idx" ON "subscription_items" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_payment_id_idx" ON "usage_credits" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN IF EXISTS "source_payment_id";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN IF EXISTS "calculation_run_id";--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP COLUMN IF EXISTS "usage_meter_id";--> statement-breakpoint
ALTER TABLE "usage_credit_applications" DROP COLUMN IF EXISTS "calculation_run_id";