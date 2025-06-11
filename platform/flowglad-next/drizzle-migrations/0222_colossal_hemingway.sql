ALTER TYPE "SubscriptionStatus" ADD VALUE 'credit_trial';
ALTER TYPE "CheckoutSessionType" ADD VALUE 'activate_subscription';
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_start" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_end" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "interval" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "interval_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "billing_cycle_anchor_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "usage_events_per_unit" integer;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "starts_with_credit_trial" boolean;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "overage_price_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_overage_price_id_prices_id_fk" FOREIGN KEY ("overage_price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;