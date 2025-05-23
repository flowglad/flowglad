
CREATE TYPE "LedgerTransactionType" AS ENUM ('usage_event_processed', 'payment_confirmed', 'promo_credit_granted', 'billing_run_usage_processed', 'billing_run_credit_applied', 'admin_credit_adjusted', 'credit_grant_expired', 'payment_refunded', 'billing_recalculated');

ALTER TABLE "ledger_transactions" DROP CONSTRAINT IF EXISTS "ledger_transactions_usage_meter_id_usage_meters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_usage_meter_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_transactions_idempotency_key_usage_meter_id_subscription_id_unique_idx";--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "type" "LedgerTransactionType";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_idempotency_key_subscription_id_unique_idx" ON "ledger_transactions" USING btree ("idempotency_key","subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_type_initiating_source_type_initiating_source_id_livemode_organization_id_unique_idx" ON "ledger_transactions" USING btree ("type","initiating_source_type","initiating_source_id","livemode","organization_id");--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP COLUMN IF EXISTS "usage_meter_id";