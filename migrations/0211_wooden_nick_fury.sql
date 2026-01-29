CREATE TABLE IF NOT EXISTS "usage_credit_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"usage_credit_id" text NOT NULL,
	"calculation_run_id" text NOT NULL,
	"amount_applied" integer NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now(),
	"target_usage_meter_id" text,
	"organization_id" text NOT NULL,
	CONSTRAINT "usage_credit_applications_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "usage_credit_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"organization_id" text NOT NULL,
	"initiating_source_type" text,
	"initiating_source_id" text,
	"description" text,
	"metadata" jsonb,
	CONSTRAINT "usage_transactions_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "usage_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credit_applications" ADD CONSTRAINT "usage_credit_applications_usage_credit_id_usage_credits_id_fk" FOREIGN KEY ("usage_credit_id") REFERENCES "public"."usage_credits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credit_applications" ADD CONSTRAINT "usage_credit_applications_target_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("target_usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credit_applications" ADD CONSTRAINT "usage_credit_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_transactions" ADD CONSTRAINT "usage_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credit_applications_usage_credit_id_idx" ON "usage_credit_applications" USING btree ("usage_credit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credit_applications_calculation_run_id_idx" ON "usage_credit_applications" USING btree ("calculation_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_transactions_initiating_source_type_initiating_source_id_idx" ON "usage_transactions" USING btree ("initiating_source_type","initiating_source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_transactions_organization_id_idx" ON "usage_transactions" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "usage_credit_applications" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "usage_credit_applications" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "usage_transactions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "usage_transactions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);