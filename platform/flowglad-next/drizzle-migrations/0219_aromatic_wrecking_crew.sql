DO $$ BEGIN
    CREATE TYPE "LedgerTransactionType" AS ENUM ('usage_event_processed', 'payment_confirmed', 'promo_credit_granted', 'billing_run_usage_processed', 'billing_run_credit_applied', 'admin_credit_adjusted', 'credit_grant_expired', 'payment_refunded', 'billing_recalculated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "LedgerEntryType" AS ENUM ('usage_cost', 'payment_recognized', 'credit_grant_recognized', 'credit_balance_adjusted', 'credit_grant_expired', 'payment_refunded', 'billing_adjustment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_source_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP CONSTRAINT IF EXISTS  "ledger_transactions_usage_meter_id_usage_meters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_entries_source_payment_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_usage_meter_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_idempotency_key_usage_meter_id_subscription_id_unique_idx";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN "entry_type";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "entry_type" "LedgerEntryType" NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credits" ALTER COLUMN "usage_meter_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "source_refund_id" text;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "type" "LedgerTransactionType" NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credits" ADD COLUMN "payment_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_refund_id_refunds_id_fk" FOREIGN KEY ("source_refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;
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
ALTER TABLE "ledger_transactions" DROP COLUMN IF EXISTS "usage_meter_id";