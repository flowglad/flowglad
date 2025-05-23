DO $$ BEGIN
    CREATE TYPE "LedgerTransactionType" AS ENUM ('usage_event_processed', 'payment_confirmed', 'promo_credit_granted', 'billing_run_usage_processed', 'billing_run_credit_applied', 'admin_credit_adjusted', 'credit_grant_expired', 'payment_refunded', 'billing_recalculated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "LedgerEntryType" AS ENUM ('usage_cost', 'payment_recognized', 'credit_grant_recognized', 'credit_applied_to_usage', 'credit_balance_adjusted', 'credit_grant_expired', 'payment_refunded', 'billing_adjustment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE IF EXISTS "ledger_transactions" DROP CONSTRAINT IF EXISTS "ledger_transactions_usage_meter_id_usage_meters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_usage_meter_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_idempotency_key_usage_meter_id_subscription_id_unique_idx";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN "entry_type";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "entry_type" "LedgerEntryType" NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "type" "LedgerTransactionType";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_idempotency_key_subscription_id_unique_idx" ON "ledger_transactions" USING btree ("idempotency_key","subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_type_initiating_source_type_initiating_source_id_livemode_organization_id_unique_idx" ON "ledger_transactions" USING btree ("type","initiating_source_type","initiating_source_id","livemode","organization_id");--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP COLUMN IF EXISTS "usage_meter_id";