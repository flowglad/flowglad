DO $$ BEGIN
    CREATE TYPE "NormalBalanceType" AS ENUM ('debit', 'credit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "LedgerTransactionInitiatingSourceType" AS ENUM ('usage_event', 'payment', 'manual_adjustment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "UsageCreditSourceReferenceType" AS ENUM ('invoice_settlement', 'manual_adjustment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"usage_meter_id" text,
	"normal_balance" "NormalBalanceType" DEFAULT 'credit' NOT NULL,
	"posted_credits_sum" text DEFAULT '0' NOT NULL,
	"posted_debits_sum" text DEFAULT '0' NOT NULL,
	"pending_credits_sum" text DEFAULT '0' NOT NULL,
	"pending_debits_sum" text DEFAULT '0' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"description" text,
	"metadata" jsonb,
	CONSTRAINT "ledger_accounts_id_unique" UNIQUE("id")
);
--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_subscription_id_entry_timestamp_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_entry_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_status_discarded_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_usage_transaction_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_source_usage_event_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_source_usage_credit_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_source_payment_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_source_credit_application_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_source_credit_balance_adjustment_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_source_billing_period_calculation_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_applied_to_ledger_item_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_billing_period_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_ledger_items_usage_meter_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_transactions_initiating_source_type_initiating_source_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_transactions_organization_id_idx";--> statement-breakpoint

ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_ledger_items" RENAME TO "ledger_entries";--> statement-breakpoint
ALTER TABLE "usage_transactions" RENAME TO "ledger_transactions";--> statement-breakpoint
ALTER TABLE "ledger_entries" RENAME COLUMN "usage_transaction_id" TO "ledger_transaction_id";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_id_unique";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_usage_transaction_id_usage_transactions_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_source_usage_event_id_usage_events_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_source_usage_credit_id_usage_credits_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_source_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_source_credit_application_id_usage_credit_applications_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_source_credit_balance_adjustment_id_usage_credit_balance_adjustments_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_billing_period_id_billing_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_usage_meter_id_usage_meters_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "usage_ledger_items_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP CONSTRAINT "usage_transactions_organization_id_organizations_id_fk";--> statement-breakpoint

ALTER TABLE "ledger_transactions" DROP CONSTRAINT "usage_transactions_id_unique";--> statement-breakpoint

ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_id_unique" UNIQUE("id");--> statement-breakpoint

ALTER TABLE "ledger_entries" ALTER COLUMN "status" SET DATA TYPE "LedgerEntryStatus";--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "direction" SET DATA TYPE "LedgerEntryDirection";--> statement-breakpoint
ALTER TABLE "usage_credits" ADD COLUMN "source_reference_type" "UsageCreditSourceReferenceType" NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "ledger_account_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "expired_at_ledger_transaction_id" text;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "subscription_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "usage_meter_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_accounts_organization_id_idx" ON "ledger_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_accounts_subscription_id_idx" ON "ledger_accounts" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_accounts_subscription_id_usage_meter_id_unique_idx" ON "ledger_accounts" USING btree ("subscription_id","usage_meter_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_usage_event_id_usage_events_id_fk" FOREIGN KEY ("source_usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_usage_credit_id_usage_credits_id_fk" FOREIGN KEY ("source_usage_credit_id") REFERENCES "public"."usage_credits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_payment_id_payments_id_fk" FOREIGN KEY ("source_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_credit_application_id_usage_credit_applications_id_fk" FOREIGN KEY ("source_credit_application_id") REFERENCES "public"."usage_credit_applications"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_credit_balance_adjustment_id_usage_credit_balance_adjustments_id_fk" FOREIGN KEY ("source_credit_balance_adjustment_id") REFERENCES "public"."usage_credit_balance_adjustments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_expired_at_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("expired_at_ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_subscription_id_entry_timestamp_idx" ON "ledger_entries" USING btree ("subscription_id","entry_timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_ledger_account_id_idx" ON "ledger_entries" USING btree ("ledger_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_entry_type_idx" ON "ledger_entries" USING btree ("entry_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_status_discarded_at_idx" ON "ledger_entries" USING btree ("status","discarded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_ledger_transaction_id_idx" ON "ledger_entries" USING btree ("ledger_transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_source_usage_event_id_idx" ON "ledger_entries" USING btree ("source_usage_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_source_usage_credit_id_idx" ON "ledger_entries" USING btree ("source_usage_credit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_source_payment_id_idx" ON "ledger_entries" USING btree ("source_payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_source_credit_application_id_idx" ON "ledger_entries" USING btree ("source_credit_application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_source_credit_balance_adjustment_id_idx" ON "ledger_entries" USING btree ("source_credit_balance_adjustment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_source_billing_period_calculation_id_idx" ON "ledger_entries" USING btree ("source_billing_period_calculation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_applied_to_ledger_item_id_idx" ON "ledger_entries" USING btree ("applied_to_ledger_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_billing_period_id_idx" ON "ledger_entries" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_usage_meter_id_idx" ON "ledger_entries" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_initiating_source_type_initiating_source_id_idx" ON "ledger_transactions" USING btree ("initiating_source_type","initiating_source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_usage_meter_id_idx" ON "ledger_transactions" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_subscription_id_idx" ON "ledger_transactions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_organization_id_idx" ON "ledger_transactions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_idempotency_key_usage_meter_id_subscription_id_unique_idx" ON "ledger_transactions" USING btree ("idempotency_key","usage_meter_id","subscription_id");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_id_unique" UNIQUE("id");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "ledger_accounts" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "ledger_accounts" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);