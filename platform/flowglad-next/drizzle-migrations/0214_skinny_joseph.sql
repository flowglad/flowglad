CREATE TYPE "FeatureType" AS ENUM ('toggle', 'usage_credit_grant');
--> statement-breakpoint
CREATE TYPE "FeatureUsageGrantFrequency" AS ENUM ('once', 'every_billing_period');

CREATE TABLE IF NOT EXISTS "features" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"organization_id" text NOT NULL,
	"type" "FeatureType" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer,
	"usage_meter_id" text,
	"renewal_frequency" "FeatureUsageGrantFrequency",
	CONSTRAINT "features_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "features" ADD CONSTRAINT "features_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "features" ADD CONSTRAINT "features_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "features_organization_id_idx" ON "features" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "features_type_idx" ON "features" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "features_organization_id_slug_unique_idx" ON "features" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "features" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "features" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);