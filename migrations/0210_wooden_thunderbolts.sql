CREATE TABLE IF NOT EXISTS "usage_credit_balance_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"organization_id" text NOT NULL,
	"adjusted_usage_credit_id" text NOT NULL,
	"amount_adjusted" integer NOT NULL,
	"reason" text NOT NULL,
	"adjusted_by_user_id" text,
	"adjustment_initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"metadata" jsonb,
	CONSTRAINT "usage_credit_balance_adjustments_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "usage_credit_balance_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credit_balance_adjustments" ADD CONSTRAINT "usage_credit_balance_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credit_balance_adjustments" ADD CONSTRAINT "usage_credit_balance_adjustments_adjusted_usage_credit_id_usage_credits_id_fk" FOREIGN KEY ("adjusted_usage_credit_id") REFERENCES "public"."usage_credits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_credit_balance_adjustments" ADD CONSTRAINT "usage_credit_balance_adjustments_adjusted_by_user_id_users_id_fk" FOREIGN KEY ("adjusted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credit_balance_adjustments_organization_id_idx" ON "usage_credit_balance_adjustments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credit_balance_adjustments_adjusted_usage_credit_id_idx" ON "usage_credit_balance_adjustments" USING btree ("adjusted_usage_credit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_credit_balance_adjustments_adjusted_by_user_id_idx" ON "usage_credit_balance_adjustments" USING btree ("adjusted_by_user_id");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "usage_credit_balance_adjustments" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "usage_credit_balance_adjustments" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);