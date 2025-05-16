

CREATE TABLE IF NOT EXISTS "usage_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"subscription_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"credit_type" "UsageCreditType" NOT NULL,
	"source_reference_id" text,
	"billing_period_id" text,
	"usage_meter_id" text,
	"issued_amount" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"initial_status" "UsageCreditInitialStatus" NOT NULL,
	"notes" text,
	"metadata" jsonb,
	CONSTRAINT "usage_credits_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "usage_credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_billing_period_id_billing_periods_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_subscription_id_idx" ON "usage_credits" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_organization_id_idx" ON "usage_credits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_billing_period_id_idx" ON "usage_credits" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_usage_meter_id_idx" ON "usage_credits" USING btree ("usage_meter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_expires_at_idx" ON "usage_credits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_credit_type_idx" ON "usage_credits" USING btree ("credit_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credits_initial_status_idx" ON "usage_credits" USING btree ("initial_status");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "usage_credits" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "usage_credits" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);
