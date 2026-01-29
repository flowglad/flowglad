DO $$ BEGIN
    CREATE TYPE "RefundStatus" AS ENUM ('pending', 'succeeded', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "LedgerEntryStatus" AS ENUM ('pending', 'posted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "LedgerEntryDirection" AS ENUM ('debit', 'credit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"payment_id" text NOT NULL,
	"subscription_id" text,
	"organization_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" "CurrencyCode" NOT NULL,
	"reason" text,
	"status" "RefundStatus" NOT NULL,
	"refund_processed_at" timestamp with time zone,
	"gateway_refund_id" text,
	"notes" text,
	"initiated_by_user_id" text,
	CONSTRAINT "refunds_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_ledger_items" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"usage_transaction_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"entry_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "LedgerEntryStatus" NOT NULL,
	"direction" "LedgerEntryDirection" NOT NULL,
	"entry_type" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text,
	"discarded_at" timestamp with time zone,
	"source_usage_event_id" text,
	"source_usage_credit_id" text,
	"source_payment_id" text,
	"source_credit_application_id" text,
	"source_credit_balance_adjustment_id" text,
	"source_billing_period_calculation_id" text,
	"applied_to_ledger_item_id" text,
	"billing_period_id" text,
	"usage_meter_id" text,
	"calculation_run_id" text,
	"metadata" jsonb,
	"organization_id" text NOT NULL,
	CONSTRAINT "usage_ledger_items_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "usage_ledger_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_transactions" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_usage_transaction_id_usage_transactions_id_fk" FOREIGN KEY ("usage_transaction_id") REFERENCES "public"."usage_transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_source_usage_event_id_usage_events_id_fk" FOREIGN KEY ("source_usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_source_usage_credit_id_usage_credits_id_fk" FOREIGN KEY ("source_usage_credit_id") REFERENCES "public"."usage_credits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_source_payment_id_payments_id_fk" FOREIGN KEY ("source_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_source_credit_application_id_usage_credit_applications_id_fk" FOREIGN KEY ("source_credit_application_id") REFERENCES "public"."usage_credit_applications"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_source_credit_balance_adjustment_id_usage_credit_balance_adjustments_id_fk" FOREIGN KEY ("source_credit_balance_adjustment_id") REFERENCES "public"."usage_credit_balance_adjustments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_ledger_items" ADD CONSTRAINT "usage_ledger_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_payment_id_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_subscription_id_idx" ON "refunds" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_subscription_id_entry_timestamp_idx" ON "usage_ledger_items" USING btree ("subscription_id","entry_timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_entry_type_idx" ON "usage_ledger_items" USING btree ("entry_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_status_discarded_at_idx" ON "usage_ledger_items" USING btree ("status","discarded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_usage_transaction_id_idx" ON "usage_ledger_items" USING btree ("usage_transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_source_usage_event_id_idx" ON "usage_ledger_items" USING btree ("source_usage_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_source_usage_credit_id_idx" ON "usage_ledger_items" USING btree ("source_usage_credit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_source_payment_id_idx" ON "usage_ledger_items" USING btree ("source_payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_source_credit_application_id_idx" ON "usage_ledger_items" USING btree ("source_credit_application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_source_credit_balance_adjustment_id_idx" ON "usage_ledger_items" USING btree ("source_credit_balance_adjustment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_source_billing_period_calculation_id_idx" ON "usage_ledger_items" USING btree ("source_billing_period_calculation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_applied_to_ledger_item_id_idx" ON "usage_ledger_items" USING btree ("applied_to_ledger_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_billing_period_id_idx" ON "usage_ledger_items" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_ledger_items_usage_meter_id_idx" ON "usage_ledger_items" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "refunds" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "refunds" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "usage_ledger_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "usage_ledger_items" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);