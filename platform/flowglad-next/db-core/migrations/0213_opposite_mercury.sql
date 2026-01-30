DO $$ BEGIN
    CREATE TYPE "SubscriptionMeterPeriodCalculationStatus" AS ENUM ('active', 'superseded', 'pending_confirmation');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "subscription_meter_period_calculations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"billing_run_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"usage_meter_id" text NOT NULL,
	"billing_period_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_raw_usage_amount" integer NOT NULL,
	"credits_applied_amount" integer NOT NULL,
	"net_billed_amount" integer NOT NULL,
	"status" "SubscriptionMeterPeriodCalculationStatus" DEFAULT 'active' NOT NULL,
	"superseded_by_calculation_id" text,
	"source_invoice_id" text,
	"notes" text,
	CONSTRAINT "subscription_meter_period_calculations_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "subscription_meter_period_calculations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_meter_period_calculations" ADD CONSTRAINT "subscription_meter_period_calculations_billing_run_id_billing_runs_id_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."billing_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_meter_period_calculations" ADD CONSTRAINT "subscription_meter_period_calculations_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_meter_period_calculations" ADD CONSTRAINT "subscription_meter_period_calculations_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_meter_period_calculations" ADD CONSTRAINT "subscription_meter_period_calculations_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_meter_period_calculations" ADD CONSTRAINT "subscription_meter_period_calculations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_meter_period_calculations" ADD CONSTRAINT "subscription_meter_period_calculations_source_invoice_id_invoices_id_fk" FOREIGN KEY ("source_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_meter_period_calculations" ADD CONSTRAINT "subscription_meter_period_calculations_superseded_by_id_fk" FOREIGN KEY ("superseded_by_calculation_id") REFERENCES "public"."subscription_meter_period_calculations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_meter_period_calculations_subscription_id_idx" ON "subscription_meter_period_calculations" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_meter_period_calculations_usage_meter_id_idx" ON "subscription_meter_period_calculations" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_meter_period_calculations_billing_period_id_idx" ON "subscription_meter_period_calculations" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_meter_period_calculations_organization_id_idx" ON "subscription_meter_period_calculations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_meter_period_calculations_status_idx" ON "subscription_meter_period_calculations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_meter_period_calculations_billing_run_id_idx" ON "subscription_meter_period_calculations" USING btree ("billing_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_meter_period_calculations_superseded_by_calculation_id_idx" ON "subscription_meter_period_calculations" USING btree ("superseded_by_calculation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_meter_period_calculations_source_invoice_id_idx" ON "subscription_meter_period_calculations" USING btree ("source_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_meter_period_calculations_active_calculation_uq" ON "subscription_meter_period_calculations" USING btree ("subscription_id","usage_meter_id","billing_period_id","status") WHERE "subscription_meter_period_calculations"."status" = 'active';--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "subscription_meter_period_calculations" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "subscription_meter_period_calculations" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);