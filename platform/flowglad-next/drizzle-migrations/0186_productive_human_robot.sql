CREATE TABLE IF NOT EXISTS "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"livemode" boolean NOT NULL,
	"customer_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"usage_meter_id" text NOT NULL,
	"billing_period_id" text NOT NULL,
	"amount" integer NOT NULL,
	"usage_date" timestamp DEFAULT now() NOT NULL,
	"transaction_id" text,
	CONSTRAINT "usage_events_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_customer_id_idx" ON "usage_events" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_usage_meter_id_idx" ON "usage_events" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_billing_period_id_idx" ON "usage_events" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_subscription_id_idx" ON "usage_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_events_transaction_id_usage_meter_id_unique_idx" ON "usage_events" USING btree ("transaction_id","usage_meter_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_meters_organization_id_name_unique_idx" ON "usage_meters" USING btree ("organization_id","name");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "usage_events" AS PERMISSIVE FOR ALL TO "authenticated" USING ("customer_id" in (select "id" from "customers" where "organization_id" in (select "organization_id" from "memberships")));--> statement-breakpoint
CREATE POLICY "Check mode" ON "usage_events" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);
--> statement-breakpoint
ALTER TYPE "PriceType" ADD VALUE 'usage';
