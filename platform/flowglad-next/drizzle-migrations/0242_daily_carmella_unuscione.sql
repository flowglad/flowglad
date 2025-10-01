ALTER TABLE "usage_credit_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_credit_balance_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_periods" ALTER COLUMN "start_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_periods" ALTER COLUMN "end_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "scheduled_for" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "started_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_runs" ALTER COLUMN "last_stripe_payment_intent_event_timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ALTER COLUMN "expires" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "occurred_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "submitted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "processed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "invoice_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "billing_period_start_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "billing_period_end_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "message_sent_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "charge_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "settlement_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "refunded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_access_sessions" ALTER COLUMN "expires" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "billing_cycle_anchor" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "purchase_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "end_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "added_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_items" ALTER COLUMN "expired_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "start_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "trial_end" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_start" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_end" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "canceled_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_scheduled_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "billing_cycle_anchor_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "usage_date" SET DATA TYPE timestamp with time zone;