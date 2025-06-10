ALTER TYPE "SubscriptionStatus" ADD VALUE 'credit_trial';
ALTER TYPE "CheckoutSessionType" ADD VALUE 'activate_subscription';
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_start" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_end" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "interval" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "interval_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "billing_cycle_anchor_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "usage_events_per_unit" integer;