DO $$ BEGIN
    CREATE TYPE "LedgerTransactionType" AS ENUM ('usage_event_processed', 'payment_confirmed', 'credit_grant_recognized', 'billing_period_transition', 'admin_credit_adjusted', 'credit_grant_expired', 'payment_refunded', 'billing_recalculated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "LedgerEntryType" AS ENUM ('usage_cost', 'payment_initiated', 'payment_failed', 'credit_grant_recognized', 'credit_balance_adjusted', 'credit_grant_expired', 'payment_refunded', 'billing_adjustment', 'usage_credit_application_debit_from_credit_balance', 'usage_credit_application_credit_towards_usage_cost');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
CREATE TYPE "UsageCreditApplicationStatus" AS ENUM ('pending', 'posted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "UsageCreditSourceReferenceType" ADD VALUE 'billing_period_transition';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_source_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP CONSTRAINT IF EXISTS "ledger_transactions_usage_meter_id_usage_meters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_entries_source_payment_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_usage_meter_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_idempotency_key_usage_meter_id_subscription_id_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "usage_credit_applications_calculation_run_id_idx";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN IF EXISTS "entry_type";
ALTER TABLE "ledger_entries" ADD COLUMN "entry_type" "LedgerEntryType";ALTER TABLE "usage_credits" ALTER COLUMN "usage_meter_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "source_refund_id" text;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "type" "LedgerTransactionType" NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ADD COLUMN "status" "UsageCreditApplicationStatus" NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ADD COLUMN "usage_event_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credits" ADD COLUMN "payment_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_refund_id_refunds_id_fk" FOREIGN KEY ("source_refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;
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
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_idempotency_key_subscription_id_unique_idx" ON "ledger_transactions" USING btree ("idempotency_key","subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_type_initiating_source_type_initiating_source_id_livemode_organization_id_unique_idx" ON "ledger_transactions" USING btree ("type","initiating_source_type","initiating_source_id","livemode","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_payment_id_idx" ON "usage_credits" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN IF EXISTS "source_payment_id";--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP COLUMN IF EXISTS "usage_meter_id";--> statement-breakpoint
ALTER TABLE "usage_credit_applications" DROP COLUMN IF EXISTS "calculation_run_id";