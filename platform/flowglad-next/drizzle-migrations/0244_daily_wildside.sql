ALTER TABLE "prices" DROP CONSTRAINT "prices_overage_price_id_prices_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "expires_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_period_items" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_period_items" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_period_items" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_periods" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_periods" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_periods" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_periods" ALTER COLUMN "start_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_periods" ALTER COLUMN "end_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "scheduled_for" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "started_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "completed_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "last_stripe_payment_intent_event_timestamp" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ALTER COLUMN "expires" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "discounts" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "discounts" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "occurred_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "submitted_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "processed_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "features" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "features" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "features" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_calculations" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "fee_calculations" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "fee_calculations" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "invoice_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "billing_period_start_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "billing_period_end_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "entry_timestamp" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "discarded_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "expired_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "links" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "links" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "message_sent_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "payment_methods" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "payment_methods" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "charge_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "settlement_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "refunded_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_models" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "pricing_models" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "pricing_models" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_features" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "product_features" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "product_features" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_features" ALTER COLUMN "expired_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proper_nouns" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "proper_nouns" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "proper_nouns" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" ALTER COLUMN "expires" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "billing_cycle_anchor" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "purchase_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "end_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "refund_processed_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ALTER COLUMN "expired_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ALTER COLUMN "detached_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "added_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "expired_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_meter_period_calculations" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_meter_period_calculations" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscription_meter_period_calculations" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_meter_period_calculations" ALTER COLUMN "calculated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "start_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "trial_end" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_start" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_end" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "canceled_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_scheduled_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "billing_cycle_anchor_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ALTER COLUMN "applied_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ALTER COLUMN "applied_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_balance_adjustments" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credit_balance_adjustments" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credit_balance_adjustments" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credit_balance_adjustments" ALTER COLUMN "adjustment_initiated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credits" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credits" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credits" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_credits" ALTER COLUMN "issued_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_credits" ALTER COLUMN "expires_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "usage_date" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_meters" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_meters" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "usage_meters" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "webhooks" ALTER COLUMN "created_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "webhooks" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz;--> statement-breakpoint
ALTER TABLE "webhooks" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN IF EXISTS "setup_fee_amount";--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN IF EXISTS "overage_price_id";--> statement-breakpoint
ALTER POLICY "Enable read for customers (pricing_models)" ON "pricing_models" TO customer USING ("id" in (select "pricing_model_id" from "customers") OR ("is_default" = true AND "organization_id" = current_organization_id()));